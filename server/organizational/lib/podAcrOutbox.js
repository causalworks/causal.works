'use strict';

// Transactional-outbox helpers. Every permission/revoke DB write goes through
// withTransaction so its outbox row(s) commit atomically with it - Postgres
// and "what CSS needs to be told" can never disagree about what happened,
// even before CSS is ever touched. server/jobs/process-acr-outbox.js is the
// only thing that reads 'pending' rows back out and does the actual .acr
// work (via podPermissions.rebuildResourceAcr), on its own schedule, with retry.

async function withTransaction(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// reason/recipientWebId are observability-only (see migration 181's comment) -
// the worker always does a full rebuild from pod_access_permissions' current
// state regardless of what triggered this row.
async function enqueueAcrRebuild(client, { orgId, resourceUrl, reason, recipientWebId }) {
  const r = await client.query(
    `INSERT INTO pod_acr_outbox (org_id, resource_url, reason, recipient_webid) VALUES ($1,$2,$3,$4) RETURNING id`,
    [orgId, resourceUrl, reason, recipientWebId || null]
  );
  return r.rows[0].id;
}

module.exports = { withTransaction, enqueueAcrRebuild };
