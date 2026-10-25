'use strict';
// A general ledger range over two fiscal years restarts income and expense balances each year. Needs SMOKE_DATABASE_URL.

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { registerLedgerReportRoutes } = require('../../server/organizational/routes/ledgerReports');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;
const routes = {};

function inOrg(w, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(w.userId); fn().then(resolve, reject); });
  });
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 4 });
  scoped = wrapPoolWithOrgScoping(pool);
  registerLedgerReportRoutes({ get: (p, ...h) => { routes[p] = h[h.length - 1]; }, post() {} }, scoped);
});
test.after(async () => { if (pool) await pool.end(); });

test('income balances restart in the second fiscal year and each section foots', { skip: SKIP }, async () => {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`GL ${stamp}`, `gl-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`gl-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    const program = (await scoped.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type, cash) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account) VALUES ($1, $2, $2, $3::org_account_type, true, 3, $4) RETURNING id`,
      [w.orgId, code, type, cash])).rows[0].id;
    const bank = await acct('1000', 'asset', true);
    const income = await acct('4000', 'income', false);
    for (const [date, cents] of [['2025-06-01', 1000], ['2026-03-01', 400]]) {
      const r = await postLedgerTransaction(scoped, { orgId: w.orgId, userId: w.userId, transactionDate: date, memo: 'Gift', source: 'manual', internalApproval: null,
        lines: [{ account_id: bank, program_id: program, debit_cents: cents }, { account_id: income, program_id: program, credit_cents: cents }] });
      assert.ok(r.httpStatus < 400, JSON.stringify(r.body));
    }
  });
  const out = { body: null };
  const res = { status() { return res; }, json(b) { out.body = b; return res; }, send() { return res; }, setHeader() {} };
  await inOrg(w, () => routes['/api/organizational/orgs/:slug/reports/general-ledger'](
    { orgId: w.orgId, user: { id: w.userId }, params: { slug: 'x' }, query: { from: '2025-01-01', to: '2026-12-31' }, headers: {} }, res));
  const sections = out.body.accounts.filter((a) => a.type === 'income');
  assert.deepEqual(sections.map((a) => [a.fiscal_year, a.opening_cents, a.closing_cents]), [[2025, '0', '1000'], [2026, '0', '400']]);
  for (const a of out.body.accounts) {
    const sign = a.natural_side === 'debit' ? 1n : -1n;
    assert.equal(BigInt(a.opening_cents) + (BigInt(a.total_debit_cents) - BigInt(a.total_credit_cents)) * sign, BigInt(a.closing_cents));
  }
});
