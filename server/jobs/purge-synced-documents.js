'use strict';

const cron = require('node-cron');
const { purgeLocalCopy } = require('../organizational/lib/documentPurge');

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
  cron.schedule('7 * * * *', () =>
    runPurgeSyncedDocuments(pool).catch((err) => console.error('[purge-synced-documents] run failed:', err.message)),
    { timezone: 'UTC' }
  );
  runPurgeSyncedDocuments(pool).catch((err) => console.error('[purge-synced-documents] boot run failed:', err.message));
}

module.exports = { schedulePurgeSyncedDocuments, runPurgeSyncedDocuments };
