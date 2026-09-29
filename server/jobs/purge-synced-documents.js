'use strict';

const cron = require('node-cron');
const { purgeLocalCopy } = require('../organizational/lib/documentPurge');

// Sweeps org_documents for anything confirmed synced (pod_synced_at set) but not yet purged
// locally, and purges it. org_documents got RLS in migration 225 (previously the one org_*
// table without it) -- this job runs outside any request's org context, so the cross-org
// discovery query goes through documents_due_for_local_purge(), a narrow SECURITY DEFINER
// function (same pattern expire-pod-permissions.js's expire_due_pod_permissions() already
// uses for the same reason), instead of relying on RLS being absent.
async function runPurgeSyncedDocuments(rawPool) {
  const dueR = await rawPool.query(`SELECT id, org_id FROM documents_due_for_local_purge(100)`);
  if (dueR.rows.length === 0) return;

  let purged = 0;
  for (const row of dueR.rows) {
    try {
      const result = await purgeLocalCopy(rawPool, row.org_id, row.id);
      if (!result.alreadyPurged) purged++;
    } catch (err) {
      console.error(`[purge-synced-documents] failed to purge document ${row.id} (org ${row.org_id}):`, err.message);
    }
  }
  if (purged > 0) console.log(`[purge-synced-documents] purged ${purged} local file(s).`);
}

function schedulePurgeSyncedDocuments(pool) {
  // Hourly - "doesn't need to be instant" per spec, since the whole point is
  // these files already made it to the pod safely before this ever runs.
  cron.schedule('7 * * * *', () =>
    runPurgeSyncedDocuments(pool).catch((err) => console.error('[purge-synced-documents] run failed:', err.message))
  );
  runPurgeSyncedDocuments(pool).catch((err) => console.error('[purge-synced-documents] boot run failed:', err.message));
}

module.exports = { schedulePurgeSyncedDocuments, runPurgeSyncedDocuments };
