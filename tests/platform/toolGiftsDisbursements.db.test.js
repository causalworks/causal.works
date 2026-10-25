'use strict';
// Disbursement and pledge-installment tools: simultaneous requests post once, an unpost frees the disbursement, an assistant only proposes.
// Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { runTool } = require('../../server/organizational/tools');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(w, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(w.userId); fn().then(resolve, reject); });
  });
}
const run = (w, name, input, actor = 'human') => inOrg(w, () => runTool(name, { pool: scoped, orgId: w.orgId, userId: w.userId, actor, programScope: null, meta: {} }, input));

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Gift ${stamp}`, `gift-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`gift-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    const q = (sql, p) => scoped.query(sql, p);
    await q('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await q(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await q(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.bank = await acct('1000', 'asset');
    await q('UPDATE org_accounts SET is_cash_account = true WHERE id = $1', [w.bank]);
    w.expense = await acct('6500', 'expense');
    w.receivable = await acct('1200', 'asset');
    const project = (await q(`INSERT INTO org_sponsored_projects (sponsor_org_id, name, program_id, disbursement_expense_account_id) VALUES ($1, 'Project', $2, $3) RETURNING id`, [w.orgId, w.program, w.expense])).rows[0].id;
    w.disbursement = (await q(`INSERT INTO org_sponsored_project_disbursements (org_id, sponsored_project_id, disbursement_date, amount_cents, status) VALUES ($1, $2, '2026-03-01', 7000, 'approved') RETURNING id`, [w.orgId, project])).rows[0].id;
    const pledge = (await q(
      `INSERT INTO org_gifts (org_id, gift_type, amount_cents, posting_status, pledge_status, receivable_account_id, program_id) VALUES ($1, 'pledge', 9000, 'posted', 'unconditional', $2, $3) RETURNING id`,
      [w.orgId, w.receivable, w.program])).rows[0].id;
    w.installment = (await q(`INSERT INTO org_gift_pledge_installments (org_id, gift_id, due_date, amount_cents) VALUES ($1, $2, '2026-04-01', 9000) RETURNING id`, [w.orgId, pledge])).rows[0].id;
  });
  return w;
}

const posted = (w, source) => inOrg(w, () => scoped.query(
  `SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = $2 AND status = 'posted'`, [w.orgId, source])).then((r) => r.rows[0].n);

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 10 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous postings of one disbursement post once; unpost frees it', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const input = { id: w.disbursement, posting_date: '2026-03-10', bank_account_id: w.bank };
  assert.equal((await run(w, 'disbursement.post', input, 'assistant')).httpStatus, 202);
  assert.equal(await posted(w, 'sponsored_disbursement'), 0);
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'disbursement.post', input)));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
  assert.equal(await posted(w, 'sponsored_disbursement'), 1);
  const un = await Promise.all(Array.from({ length: 3 }, () => run(w, 'disbursement.unpost', { id: w.disbursement, reason: 'wrong date' })));
  assert.equal(un.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(un.map((r) => r.httpStatus)));
  assert.equal(await posted(w, 'sponsored_disbursement'), 0);
});

test('five simultaneous receipts of one pledge installment post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const input = { id: w.installment, bank_account_id: w.bank, date: '2026-04-02', amount_cents: 9000 };
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'pledge_installment.receive', input)));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
  assert.equal(await posted(w, 'manual'), 1);
  const status = (await inOrg(w, () => scoped.query('SELECT status FROM org_gift_pledge_installments WHERE id = $1', [w.installment]))).rows[0].status;
  assert.equal(status, 'collected');
});
