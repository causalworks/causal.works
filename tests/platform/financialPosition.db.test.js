'use strict';
// Statement of Financial Position built from the ledger: totals tie, designations carry on equity lines, and bad tags are rejected. Needs SMOKE_DATABASE_URL (see freshWorkspace.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { buildFinancialPosition } = require('../../server/organizational/lib/financialPositionStatement');

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
    `INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Position ${stamp}`, `position-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`position-${stamp}@example.test`])).rows[0];
  return inOrg(org.id, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [org.id]);
    const program = (await scoped.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [org.id])).rows[0].id;
    const acct = async (code, name, type) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account)
       VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`, [org.id, code, name, type, type === 'asset'])).rows[0].id;
    const designation = (await scoped.query(`INSERT INTO org_board_designations (org_id, name) VALUES ($1, 'Reserve') RETURNING id`, [org.id])).rows[0].id;
    return {
      orgId: org.id, userId: user.id, program, designation,
      bank: await acct('1000', 'Operating', 'asset'),
      payable: await acct('2000', 'Payable', 'liability'),
      undesignated: await acct('3100', 'Net Assets Without Donor Restrictions', 'equity'),
      designated: await acct('3300', 'Board-Designated Reserve', 'equity'),
      income: await acct('4000', 'Grants', 'income'),
      expense: await acct('6000', 'Programs', 'expense'),
    };
  });
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pool = new pg.Pool({ connectionString: URL, max: 4 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('financial position ties out and designated plus undesignated equals net assets without restrictions', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const base = { orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Test', source: 'manual', internalApproval: null };
    const ln = (account_id, side, cents, extra = {}) => ({ account_id, program_id: w.program, [side]: cents, ...extra });
    for (const lines of [
      [ln(w.bank, 'debit_cents', 1000000), ln(w.undesignated, 'credit_cents', 1000000)],
      [ln(w.bank, 'debit_cents', 50000), ln(w.income, 'credit_cents', 50000, { donor_restriction_class: 'temporarily_restricted' })],
      [ln(w.expense, 'debit_cents', 20000), ln(w.bank, 'credit_cents', 20000)],
      [ln(w.bank, 'debit_cents', 30000), ln(w.payable, 'credit_cents', 30000)],
      [ln(w.undesignated, 'debit_cents', 400000), ln(w.designated, 'credit_cents', 400000, { board_designation_id: w.designation })],
    ]) {
      const r = await postLedgerTransaction(scoped, { ...base, lines });
      assert.ok(!r.httpStatus || r.httpStatus < 400, JSON.stringify(r.body));
    }
    const st = await buildFinancialPosition(scoped, w.orgId, 2026);
    assert.strictEqual(st.totals.assets, 1060000);
    assert.strictEqual(st.totals.liabilities, 30000);
    assert.strictEqual(st.totals.net_assets, 1030000);
    assert.strictEqual(st.totals.assets, st.totals.liabilities + st.totals.net_assets);
    assert.strictEqual(st.net_assets.board_designated, 400000);
    assert.strictEqual(st.net_assets.undesignated, 580000);
    assert.strictEqual(st.net_assets.board_designated + st.net_assets.undesignated, st.net_assets.without_restrictions);
    assert.deepStrictEqual(st.warnings, []);
    const sub = st.rows.find((r) => r.label === 'Net assets without donor restrictions');
    assert.strictEqual(sub.amount_cents, 980000);
  });
});

test('a board designation on an asset line is rejected', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const ln = (account_id, side, cents, extra = {}) => ({ account_id, program_id: w.program, [side]: cents, ...extra });
    const r = await postLedgerTransaction(scoped, {
      orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Bad tag', source: 'manual', internalApproval: null,
      lines: [ln(w.bank, 'debit_cents', 1000, { board_designation_id: w.designation }), ln(w.undesignated, 'credit_cents', 1000)],
    });
    assert.strictEqual(r.httpStatus, 422);
    assert.strictEqual(r.body.code, 'designation_not_on_equity');
  });
});

test('designations larger than net assets without restrictions give a warning, not a blocked statement', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const ln = (account_id, side, cents, extra = {}) => ({ account_id, program_id: w.program, [side]: cents, ...extra });
    const base = { orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Test', source: 'manual', internalApproval: null };
    await postLedgerTransaction(scoped, { ...base, lines: [ln(w.bank, 'debit_cents', 10000), ln(w.undesignated, 'credit_cents', 10000)] });
    await postLedgerTransaction(scoped, { ...base, lines: [ln(w.undesignated, 'debit_cents', 15000), ln(w.designated, 'credit_cents', 15000, { board_designation_id: w.designation })] });
    const st = await buildFinancialPosition(scoped, w.orgId, 2026);
    assert.strictEqual(st.warnings.length, 1);
    assert.match(st.warnings[0], /exceed net assets without donor restrictions/);
  });
});
