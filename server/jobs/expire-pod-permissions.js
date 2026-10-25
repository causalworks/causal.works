'use strict';

const cron = require('node-cron');

async function runExpirePodPermissions(rawPool) {
  const expiredR = await rawPool.query(`SELECT * FROM expire_due_pod_permissions()`);
  if (expiredR.rows.length === 0) return;

  const resources = new Set(expiredR.rows.map((r) => `${r.org_slug}:${r.resource_url}`));
  console.log(`[expire-pod-permissions] revoked ${expiredR.rows.length} permission(s) across ${resources.size} resource(s); .acr outbox row(s) enqueued for process-acr-outbox.js to pick up.`);
}

function scheduleExpirePodPermissions(pool) {
  cron.schedule('* * * * *', () => runExpirePodPermissions(pool).catch((err) => console.error('[expire-pod-permissions] run failed:', err.message)), { timezone: 'UTC' });

  runExpirePodPermissions(pool).catch((err) => console.error('[expire-pod-permissions] boot run failed:', err.message));
}

module.exports = { scheduleExpirePodPermissions, runExpirePodPermissions };
