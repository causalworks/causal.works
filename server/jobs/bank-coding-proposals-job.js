// Prepares bank line coding proposals (from bank rules, payee history and the language model step) for every workspace whose assistant is on.
const cron = require('node-cron');
const { requestContextMiddleware, enterOrgContext, enterProgramScope } = require('../organizational/lib/orgContext');
const { wrapPoolWithOrgScoping } = require('../organizational/lib/scopedPool');
const { proposeForUnconfirmedLines } = require('../organizational/lib/bankLineProposals');

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware(null, null, () => {
      enterOrgContext(orgId);
      enterProgramScope(null);
      Promise.resolve().then(fn).then(resolve, reject);
    });
  });
}

async function runBankCodingProposalsJob(pool) {
  const scoped = wrapPoolWithOrgScoping(pool);
  const list = await pool.query('SELECT * FROM org_assistant_workspaces()');
  const totals = { workspaces: 0, proposed: 0, expired: 0 };
  for (const ws of list.rows) {
    try {
      const out = await inOrg(ws.org_id, () => proposeForUnconfirmedLines(scoped, ws.org_id));
      totals.workspaces++;
      totals.proposed += out.proposed || 0;
      totals.expired += out.expired || 0;
    } catch (err) {
      console.error('[bank-coding-proposals-job] workspace ' + ws.org_id + ':', err.message);
    }
  }
  if (totals.proposed || totals.expired) {
    console.log('[bank-coding-proposals-job] proposed ' + totals.proposed + ', expired ' + totals.expired);
  }
  return totals;
}

function scheduleBankCodingProposalsJob(pool) {
  cron.schedule('20 */4 * * *', () => runBankCodingProposalsJob(pool).catch((err) => console.error('[bank-coding-proposals-job]', err.message)), { timezone: 'UTC' });
}

module.exports = { scheduleBankCodingProposalsJob, runBankCodingProposalsJob };
