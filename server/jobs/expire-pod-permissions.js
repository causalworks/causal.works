'use strict';

const cron = require('node-cron');

// Sweeps pod_access_permissions for anything past its expires_at and marks it
// revoked. expire_due_pod_permissions() (migration 183, renamed by 188) now
// enqueues the resulting .acr rebuild(s) into pod_acr_outbox itself, in the
// same SQL statement as the revoke - this job no longer rebuilds ACRs
// directly. server/jobs/process-acr-outbox.js is what actually gets CSS
// caught up, with retry - this job had the exact same synchronous-rebuild-
// no-retry gap group-member removal did, and now shares the same fix instead
// of being a second, inconsistent mechanism chasing the same goal.
// A manual "Revoke now" button (server/organizational/routes/podPermissions.js)
// covers the live-demo case where waiting on this interval isn't practical.
async function runExpirePodPermissions(rawPool) {
  const expiredR = await rawPool.query(`SELECT * FROM expire_due_pod_permissions()`);
  if (expiredR.rows.length === 0) return;

  const resources = new Set(expiredR.rows.map((r) => `${r.org_slug}:${r.resource_url}`));
  console.log(`[expire-pod-permissions] revoked ${expiredR.rows.length} permission(s) across ${resources.size} resource(s); .acr outbox row(s) enqueued for process-acr-outbox.js to pick up.`);
}

function scheduleExpirePodPermissions(pool) {
  // Every minute - permissions are meant to be usable for short-lived
  // live-demo windows (minutes, not just days), so this needs to be prompt.
  // The manual revoke button exists precisely so a demo never has to wait on
  // this.
  cron.schedule('* * * * *', () => runExpirePodPermissions(pool).catch((err) => console.error('[expire-pod-permissions] run failed:', err.message)));

  runExpirePodPermissions(pool).catch((err) => console.error('[expire-pod-permissions] boot run failed:', err.message));
}

module.exports = { scheduleExpirePodPermissions, runExpirePodPermissions };
