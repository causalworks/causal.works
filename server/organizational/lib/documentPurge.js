'use strict';

// Local-copy purge - deletes a document's file from local disk once it's
// confirmed to have reached the pod (org_documents.pod_synced_at, rev 62),
// keeping the DB row and all its metadata (including stored_path as a
// historical record and checksum_sha256 as the pod-fetch integrity anchor)
// permanently. Refuses outright if pod_synced_at isn't set - this phase
// depends entirely on that fact being trustworthy, not on inferring it from
// org_settings.pod_last_synced_at or elapsed time.

const fs = require('fs');
const path = require('path');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));

async function purgeLocalCopy(pool, orgId, documentId) {
  // org_documents has RLS now (migration 225) and this runs from a cron job with no request
  // org context to satisfy it -- get_document_purge_status() is the same narrow, auditable
  // SECURITY DEFINER escape hatch the job's own cross-org sweep already uses.
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

  // Missing-on-disk is not an error here - the goal (no local copy) is
  // already true, so still record the purge rather than leaving
  // local_copy_purged_at null for a file that's already gone.
  if (fs.existsSync(resolved)) {
    fs.unlinkSync(resolved);
  }

  await pool.query(`SELECT mark_document_local_copy_purged($1)`, [documentId]);
  return { alreadyPurged: false };
}

module.exports = { purgeLocalCopy };
