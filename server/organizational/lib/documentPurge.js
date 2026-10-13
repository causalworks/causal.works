'use strict';

const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));

async function purgeLocalCopy(pool, orgId, documentId) {
  const docR = await pool.query(
    `SELECT * FROM get_document_purge_status($1, $2)`,
    [documentId, orgId]
  );
  const doc = docR.rows[0];
  if (!doc) throw new Error(`Document ${documentId} not found for org ${orgId}`);
  if (!doc.pod_synced_at) throw new Error(`Document ${documentId} has not been confirmed synced to the pod (pod_synced_at is null) - refusing to purge`);
  if (doc.local_copy_purged_at) return { alreadyPurged: true };

  const resolved = path.resolve(UPLOADS_ROOT, doc.stored_path);
  if (!resolved.startsWith(UPLOADS_ROOT + path.sep)) {
    throw new Error(`Refusing to purge: resolved path escapes uploads root (${doc.stored_path})`);
  }

  if (fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }

  await pool.query(`SELECT mark_document_local_copy_purged($1)`, [documentId]);
  return { alreadyPurged: false };
}

module.exports = { purgeLocalCopy };
