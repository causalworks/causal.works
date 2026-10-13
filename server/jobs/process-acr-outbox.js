'use strict';

const cron = require('node-cron');
const { wrapPoolWithOrgScoping } = require('../organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../organizational/lib/orgContext');
const { rebuildResourceAcr, deleteShareResource } = require('../organizational/lib/podPermissions');

const MAX_ATTEMPTS = 5;

function backoffMs(attemptCount) {
  return Math.min(5000 * 2 ** attemptCount, 180000);
}

async function runProcessAcrOutbox(rawPool) {
  const scopedPool = wrapPoolWithOrgScoping(rawPool);
  const claimedR = await rawPool.query(`SELECT * FROM claim_due_pod_acr_outbox_rows($1)`, [50]);
  if (claimedR.rows.length === 0) return;

  for (const row of claimedR.rows) {
    await new Promise((resolve) => {
      requestContextMiddleware({}, {}, async () => {
        enterOrgContext(row.org_id);
        try {
          try {
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
