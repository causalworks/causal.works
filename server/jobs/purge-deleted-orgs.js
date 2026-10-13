const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { deleteOrgPodAccount } = require('../organizational/lib/podCredentialStore');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../uploads'));
const DOCUMENTS_ROOT = path.join(UPLOADS_ROOT, 'documents');

const RETENTION_DAYS = 30;

async function runPurgeDeletedOrgs(pool) {
  const dueR = await pool.query(
    `SELECT id, slug FROM coop_members
     WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - ($1 || ' days')::interval`,
    [String(RETENTION_DAYS)]
  );

  for (const row of dueR.rows) {
    try {
      try {
        await deleteOrgPodAccount(pool, row.id, row.slug);
      } catch (podErr) {
        console.error(`[purge-deleted-orgs] pod account deletion failed for org_id=${row.id} slug=${row.slug}:`, podErr.message);
      }

      await pool.query(`SELECT * FROM admin_delete_org($1)`, [row.id]);
      await fs.promises.rm(path.join(DOCUMENTS_ROOT, String(row.id)), { recursive: true, force: true });
      console.log(`[purge-deleted-orgs] purged org_id=${row.id} slug=${row.slug}`);
    } catch (err) {
      console.error(`[purge-deleted-orgs] failed to purge org_id=${row.id} slug=${row.slug}:`, err.message);
    }
  }
}

function schedulePurgeDeletedOrgs(pool) {
  cron.schedule('45 3 * * *', () => runPurgeDeletedOrgs(pool), { timezone: 'UTC' });

  runPurgeDeletedOrgs(pool).catch((err) => console.error('[purge-deleted-orgs] boot run failed:', err.message));
}

module.exports = {
  schedulePurgeDeletedOrgs,
  runPurgeDeletedOrgs,
};
