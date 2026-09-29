const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { deleteOrgPodAccount } = require('../organizational/lib/podCredentialStore');

// Matches server/organizational/routes/documents.js's UPLOADS_ROOT/DOCUMENTS_ROOT exactly —
// org uploads live at <UPLOADS_ROOT>/documents/<org_id>/<year>/<uuid>.<ext>.
const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../uploads'));
const DOCUMENTS_ROOT = path.join(UPLOADS_ROOT, 'documents');

const RETENTION_DAYS = 30;

/** Hard-deletes orgs that have been soft-deleted (coop_members.deleted_at) for more than
 *  RETENTION_DAYS. DB rows cascade via coop_members' FKs (see migration 138 for the
 *  org_audit_log fix that makes the cascade complete); uploaded files are removed
 *  by deleting the org's whole documents directory. */
async function runPurgeDeletedOrgs(pool) {
  const dueR = await pool.query(
    `SELECT id, slug FROM coop_members
     WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval`,
    [String(RETENTION_DAYS)]
  );

  for (const row of dueR.rows) {
    try {
      // Deprovision the org's Solid pod account first -- it reads org_pod_credentials, which
      // admin_delete_org's cascade below removes. Left out entirely until 2026-09-27 (found via
      // 3 leftover test-workspace accounts from 2026-09-25's ODI review pass): every org
      // deletion left its dedicated CSS account (and the pod it owns) orphaned on the pod
      // server forever, never cleaned up by anything. A pod-deletion failure is logged, not
      // fatal -- the DB purge below still needs to happen either way.
      try {
        await deleteOrgPodAccount(pool, row.id, row.slug);
      } catch (podErr) {
        console.error(`[purge-deleted-orgs] pod account deletion failed for org_id=${row.id} slug=${row.slug}:`, podErr.message);
      }

      // Cross-org cascade delete -- see migration 149 for why this must go
      // through a SECURITY DEFINER function once causal_app/RLS is enforced.
      await pool.query(`SELECT * FROM admin_delete_org($1)`, [row.id]);
      await fs.promises.rm(path.join(DOCUMENTS_ROOT, String(row.id)), { recursive: true, force: true });
      console.log(`[purge-deleted-orgs] purged org_id=${row.id} slug=${row.slug}`);
    } catch (err) {
      console.error(`[purge-deleted-orgs] failed to purge org_id=${row.id} slug=${row.slug}:`, err.message);
    }
  }
}

function schedulePurgeDeletedOrgs(pool) {
  // Daily at 03:45 UTC, off-peak and offset from the other scheduled jobs.
  cron.schedule('45 3 * * *', () => runPurgeDeletedOrgs(pool), { timezone: 'UTC' });

  // Also do an eager run on boot, matching the other jobs' pattern.
  runPurgeDeletedOrgs(pool).catch((err) => console.error('[purge-deleted-orgs] boot run failed:', err.message));
}

module.exports = {
  schedulePurgeDeletedOrgs,
  runPurgeDeletedOrgs,
};
