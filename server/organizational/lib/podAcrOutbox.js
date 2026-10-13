'use strict';

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

async function enqueueAcrRebuild(client, { orgId, resourceUrl, reason, recipientWebId }) {
  const r = await client.query(
    `INSERT INTO pod_acr_outbox (org_id, resource_url, reason, recipient_webid) VALUES ($1,$2,$3,$4) RETURNING id`,
    [orgId, resourceUrl, reason, recipientWebId || null]
  );
  return r.rows[0].id;
}

module.exports = { withTransaction, enqueueAcrRebuild };
