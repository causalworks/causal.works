// Daily membership work for every workspace with membership on: clear join requests never confirmed, record status
// changes in the history, and send the scheduled messages (welcome, renewal notices, grace, win-back, failed payment).
// Every send is logged first under a unique key, so a rerun on the same day sends nothing twice.
const cron = require('node-cron');
const { requestContextMiddleware, enterOrgContext, enterProgramScope } = require('../organizational/lib/orgContext');
const { wrapPoolWithOrgScoping } = require('../organizational/lib/scopedPool');
const { runDailyForWorkspace } = require('../organizational/lib/membershipMessages');

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware(null, null, () => {
      enterOrgContext(orgId);
      enterProgramScope(null);
      Promise.resolve().then(fn).then(resolve, reject);
    });
  });
}

async function runMembershipDailyJob(pool, opts) {
  const scoped = wrapPoolWithOrgScoping(pool);
  const list = await pool.query('SELECT * FROM org_membership_workspaces()');
  const totals = { workspaces: 0, sent: 0, skipped: 0, failed: 0, status_changes: 0 };
  for (const ws of list.rows) {
    try {
      const out = await inOrg(ws.org_id, () => runDailyForWorkspace(scoped, { id: ws.org_id, slug: ws.slug, display_name: ws.display_name }, opts));
      totals.workspaces++;
      totals.sent += out.sent; totals.skipped += out.skipped; totals.failed += out.failed; totals.status_changes += out.status_changes;
    } catch (err) {
      console.error('[membership-daily-job] workspace ' + ws.org_id + ':', err.message);
    }
  }
  if (totals.sent || totals.failed || totals.status_changes) {
    console.log('[membership-daily-job] sent ' + totals.sent + ', skipped ' + totals.skipped + ', failed ' + totals.failed + ', status changes ' + totals.status_changes);
  }
  return totals;
}

function scheduleMembershipDailyJob(pool) {
  cron.schedule('40 13 * * *', () => runMembershipDailyJob(pool).catch((err) => console.error('[membership-daily-job]', err.message)), { timezone: 'UTC' });
}

module.exports = { scheduleMembershipDailyJob, runMembershipDailyJob };
