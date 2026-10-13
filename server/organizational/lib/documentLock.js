'use strict';

// One lock per document, held until release(), so two requests on the same record run one after the other.

async function acquireDocumentLock(pool, key) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [String(key)]);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
    throw e;
  }
  return {
    release: async () => {
      try { await client.query('COMMIT'); } catch (_) { /* connection already closed */ }
      client.release();
    },
  };
}

module.exports = { acquireDocumentLock };
