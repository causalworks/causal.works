'use strict';
// Statement of Activities, Cash Flows and Functional Expenses built from the ledger tie to the ledger and to each other. Needs SMOKE_DATABASE_URL (see freshWorkspace.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { buildFinancialPosition } = require('../../server/organizational/lib/financialPositionStatement');
const { buildStatementOfActivities } = require('../../server/organizational/lib/statementOfActivities');
const { buildCashFlows } = require('../../server/organizational/lib/cashFlowStatement');
const { buildFunctionalExpenses } = require('../../server/organizational/lib/functionalExpensesStatement');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(orgId); fn().then(resolve, reject); });
  });
}

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(
    `INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Statements ${stamp}`, `statements-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`statements-${stamp}@example.test`])).rows[0];
  return inOrg(org.id, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [org.id]);
    const program = (await scoped.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [org.id])).rows[0].id;
    const acct = async (code, name, type, { cash = false, category = null } = {}) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account, standard_category)
       VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5, $6) RETURNING id`, [org.id, code, name, type, cash, category])).rows[0].id;
    const w = {
      orgId: org.id, userId: user.id, program,
      bank: await acct('1000', 'Operating', 'asset', { cash: true }),
      fixed: await acct('1500', 'Equipment', 'asset', { category: 'ASSET_FIXED' }),
      accumulated: await acct('1590', 'Accumulated Depreciation', 'asset', { category: 'ASSET_FIXED' }),
      payable: await acct('2000', 'Payable', 'liability'),
      equity: await acct('3100', 'Net Assets Without Donor Restrictions', 'equity'),
      income: await acct('4000', 'Grants', 'income'),
      expense: await acct('6000', 'Programs', 'expense'),
      depreciation: await acct('6100', 'Depreciation', 'expense'),
    };
    await scoped.query(
      `INSERT INTO org_functional_classifications (org_id, account_id, fiscal_year, program_services_bps, mgmt_general_bps, fundraising_bps) VALUES ($1, $2, 2026, 7000, 2000, 1000)`,
      [org.id, w.expense]);
    return w;
  });
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pool = new pg.Pool({ connectionString: URL, max: 4 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('activities, cash flows and functional expenses tie to the ledger and to each other', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const T = 'temporarily_restricted';
    const base = { orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Test', source: 'manual', internalApproval: null };
    const ln = (account_id, side, cents, rc) => ({ account_id, program_id: w.program, [side]: cents, ...(rc ? { donor_restriction_class: rc } : {}) });
    for (const lines of [
      [ln(w.bank, 'debit_cents', 1000000), ln(w.equity, 'credit_cents', 1000000)],
      [ln(w.bank, 'debit_cents', 50000), ln(w.income, 'credit_cents', 50000, T)],
      [ln(w.bank, 'debit_cents', 80000), ln(w.income, 'credit_cents', 80000)],
      [ln(w.expense, 'debit_cents', 20000, T), ln(w.bank, 'credit_cents', 20000)],
      [ln(w.expense, 'debit_cents', 30000), ln(w.bank, 'credit_cents', 30000)],
      [ln(w.fixed, 'debit_cents', 40000), ln(w.bank, 'credit_cents', 40000)],
      [ln(w.depreciation, 'debit_cents', 5000), ln(w.accumulated, 'credit_cents', 5000)],
      [ln(w.bank, 'debit_cents', 30000), ln(w.payable, 'credit_cents', 30000)],
    ]) {
      const r = await postLedgerTransaction(scoped, { ...base, lines });
      assert.ok(!r.httpStatus || r.httpStatus < 400, JSON.stringify(r.body));
    }

    const position = await buildFinancialPosition(scoped, w.orgId, 2026);
    const activities = await buildStatementOfActivities(scoped, w.orgId, 2026);
    const flows = await buildCashFlows(scoped, w.orgId, 2026);
    const functional = await buildFunctionalExpenses(scoped, w.orgId, 2026);

    assert.strictEqual(activities.net_assets.ending.total_cents, position.totals.net_assets);
    assert.strictEqual(activities.net_assets.ending.without_restrictions_cents, position.net_assets.without_restrictions);
    assert.strictEqual(activities.totals.released_from_restrictions_cents, 20000);

    assert.strictEqual(flows.net_change_cents, 1070000);
    assert.strictEqual(flows.ending_cash_cents, 1000000 + 50000 + 80000 - 20000 - 30000 - 40000 + 30000);
    const investing = flows.rows.find((r) => r.key === 'investing' && r.kind === 'subtotal');
    assert.strictEqual(investing.amount_cents, -40000);

    const total = functional.rows.find((r) => r.kind === 'grand');
    assert.strictEqual(total.total_cents, 55000);
    const expenseRow = functional.rows.find((r) => r.code === '6000');
    assert.deepStrictEqual([expenseRow.program_services_cents, expenseRow.mgmt_general_cents, expenseRow.fundraising_cents], [35000, 10000, 5000]);
    const activitiesExpenses = activities.rows.find((r) => r.key === 'expenses' && r.kind === 'subtotal');
    assert.strictEqual(total.total_cents, activitiesExpenses.amount_cents);
  });
});
