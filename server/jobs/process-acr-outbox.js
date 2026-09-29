'use strict';

const cron = require('node-cron');
const { wrapPoolWithOrgScoping } = require('../organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../organizational/lib/orgContext');
const { rebuildResourceAcr, deleteShareResource } = require('../organizational/lib/podPermissions');

// Processes pod_acr_outbox: the guaranteed-delivery half of the transactional
// outbox (migration 181). Every permission/revoke DB write already committed
// its outbox row atomically with the write itself (podAcrOutbox.js's
// withTransaction) - this job's only job is to notice pending rows and get
// CSS caught up, retrying on failure instead of leaving Postgres and CSS to
// silently disagree forever (the exact gap this whole mechanism exists to
// close). Runs every 10s, not once a minute like expire-pod-permissions.js's
// sibling job - the point of the outbox is to shrink the propagation window,
// so it needs to actually be short.

const MAX_ATTEMPTS = 5;

// Exponential, capped at a few minutes: 5s, 10s, 20s, 40s, 80s, then capped
// at 180s if MAX_ATTEMPTS were ever raised. Standard default, not tuned
// against real failure data yet - fine to revisit once there is any.
function backoffMs(attemptCount) {
  return Math.min(5000 * 2 ** attemptCount, 180000);
}

async function runProcessAcrOutbox(rawPool) {
  const scopedPool = wrapPoolWithOrgScoping(rawPool);
  const claimedR = await rawPool.query(`SELECT * FROM claim_due_pod_acr_outbox_rows($1)`, [50]);
  if (claimedR.rows.length === 0) return;

  for (const row of claimedR.rows) {
    // finally{resolve()} is load-bearing: a row is marked 'processing' by
    // the claim query before this runs, and only a 'pending' row is ever
    // reclaimed (migration 182) - if resolve() is skipped (e.g. the
    // recovery UPDATE in the catch block below itself throws), the row is
    // orphaned at 'processing' forever with no retry, reproducing the
    // exact silent-stuck-state failure mode this whole mechanism exists to
    // close. Found live in testing: a row got stuck this way once,
    // reprocessed cleanly on manual retry, root cause not conclusively
    // pinned down - but the missing safety net was real regardless of what
    // triggered it that once, so fixing the net rather than chasing a
    // possibly-transient trigger.
    await new Promise((resolve) => {
      requestContextMiddleware({}, {}, async () => {
        enterOrgContext(row.org_id);
        try {
          try {
            // 'delete_share' rows (a link-share permission's copy, revoked
            // or expired) delete the resource outright instead of rebuilding
            // an ACR - there's no per-WebID policy to remove, the whole
            // point of the resource was to exist only while the permission
            // was live.
            if (row.reason === 'delete_share') {
              await deleteShareResource(scopedPool, row.org_id, row.org_slug, row.resource_url);
            } else {
              await rebuildResourceAcr(scopedPool, row.org_id, row.org_slug, row.resource_url);
            }
            await scopedPool.query(`UPDATE pod_acr_outbox SET status = 'done', done_at = now() WHERE id = $1`, [row.id]);
          } catch (err) {
            const newAttemptCount = row.attempt_count + 1;
            if (newAttemptCount >= MAX_ATTEMPTS) {
              await scopedPool.query(
                `UPDATE pod_acr_outbox SET status = 'failed', attempt_count = $2, last_error = $3 WHERE id = $1`,
                [row.id, newAttemptCount, err.message]
              );
              console.error(
                `[process-acr-outbox] PERSISTENTLY FAILED after ${newAttemptCount} attempts, giving up: ` +
                `org=${row.org_slug} resource=${row.resource_url}: ${err.message}`
              );
            } else {
              const delayMs = backoffMs(newAttemptCount);
              await scopedPool.query(
                `UPDATE pod_acr_outbox
                    SET status = 'pending', attempt_count = $2, last_error = $3, next_attempt_at = now() + ($4 || ' milliseconds')::interval
                  WHERE id = $1`,
                [row.id, newAttemptCount, err.message, String(delayMs)]
              );
              console.warn(
                `[process-acr-outbox] attempt ${newAttemptCount}/${MAX_ATTEMPTS} failed, retrying in ${delayMs}ms: ` +
                `org=${row.org_slug} resource=${row.resource_url}: ${err.message}`
              );
            }
          }
        } catch (outerErr) {
          // Even the recovery UPDATE itself failed (e.g. a transient DB
          // blip at exactly the wrong moment). The row is left 'processing'
          // in the DB, but next_attempt_at was never pushed forward - a
          // periodic reconciliation sweep (not yet built) is the real
          // backstop for this specific residual case; logging loudly here
          // is the immediate, honest fallback so it's visible rather than
          // silent.
          console.error(
            `[process-acr-outbox] FAILED TO RECORD OUTCOME for row ${row.id} (org=${row.org_slug} resource=${row.resource_url}) - ` +
            `it may be stuck at 'processing' until manually reset or a reconciliation sweep exists: ${outerErr.message}`
          );
        } finally {
          resolve();
        }
      });
    });
  }
}

function scheduleProcessAcrOutbox(pool) {
  cron.schedule('*/10 * * * * *', () =>
    runProcessAcrOutbox(pool).catch((err) => console.error('[process-acr-outbox] run failed:', err.message))
  );
  runProcessAcrOutbox(pool).catch((err) => console.error('[process-acr-outbox] boot run failed:', err.message));
}

module.exports = { scheduleProcessAcrOutbox, runProcessAcrOutbox };
