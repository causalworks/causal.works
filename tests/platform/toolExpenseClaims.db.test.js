'use strict';
// Expense claim tools: approval and payment post once under simultaneous requests, the submitter cannot approve, and void follows the permission rule.
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

function inOrg(w, fn, userId = w.submitter) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(userId); fn().then(resolve, reject); });
  });
}
const ctx = (w, userId, extra = {}) => ({ pool: scoped, orgId: w.orgId, userId, actor: 'human', programScope: null, orgRole: 'admin', meta: {}, ...extra });
const run = (w, userId, name, input, extra) => inOrg(w, () => runTool(name, ctx(w, userId, extra), input), userId);

async function makeWorkspace(status) {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Claim ${stamp}`, `claim-${stamp}`])).rows[0];
  const mkUser = async (n) => (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`claim-${n}-${stamp}@example.test`])).rows[0].id;
  const w = { orgId: org.id, submitter: await mkUser('s'), approver: await mkUser('a') };
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
    w.claim = (await q(`INSERT INTO org_expense_claims (org_id, submitted_by, claim_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', $3, 2026) RETURNING id`, [w.orgId, w.submitter, status])).rows[0].id;
    await q(`INSERT INTO org_expense_claim_lines (claim_id, account_id, program_id, expense_date, description, amount_cents) VALUES ($1, $2, $3, '2026-03-01', 'Supplies', 5000)`, [w.claim, w.expense, w.program]);
  });
  return w;
}

const countTxns = (w, source) => inOrg(w, () => scoped.query(
  `SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = $2 AND status = 'posted'`, [w.orgId, source])).then((r) => r.rows[0].n);

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 10 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous approvals post once, and the submitter cannot approve', { skip: SKIP }, async () => {
  const w = await makeWorkspace('pending_approval');
  const own = await run(w, w.submitter, 'expense_claim.approve', { id: w.claim });
  assert.equal(own.body.code, 'self_approval_blocked');
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, w.approver, 'expense_claim.approve', { id: w.claim })));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
  assert.equal(await countTxns(w, 'expense_claim_approval'), 1);
});

test('five simultaneous payments of an approved claim post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace('pending_approval');
  assert.equal((await run(w, w.approver, 'expense_claim.approve', { id: w.claim })).httpStatus, 200);
  const input = { id: w.claim, bank_account_id: w.bank, payment_date: '2026-03-20' };
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, w.approver, 'expense_claim.pay', input)));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
  assert.equal(await countTxns(w, 'expense_claim_payment'), 1);
  const n = (await inOrg(w, () => scoped.query('SELECT COUNT(*)::int AS n FROM org_expense_claim_payments WHERE claim_id = $1', [w.claim]))).rows[0].n;
  assert.equal(n, 1);
});

test('void: another user needs accounting write access; an assistant only proposes; simultaneous voids end once', { skip: SKIP }, async () => {
  const w = await makeWorkspace('pending_approval');
  await run(w, w.approver, 'expense_claim.approve', { id: w.claim });
  const input = { id: w.claim, reason: 'duplicate' };
  const denied = await run(w, w.approver, 'expense_claim.void', input, { accountingWriter: async () => ({ httpStatus: 403, body: { error: 'no' } }) });
  assert.equal(denied.httpStatus, 403);
  const proposal = await run(w, w.approver, 'expense_claim.void', input, { actor: 'assistant' });
  assert.equal(proposal.httpStatus, 202);
  const allow = { accountingWriter: async () => null };
  const results = await Promise.all(Array.from({ length: 3 }, () => run(w, w.approver, 'expense_claim.void', input, allow)));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
  const status = (await inOrg(w, () => scoped.query('SELECT status FROM org_expense_claims WHERE id = $1', [w.claim]))).rows[0].status;
  assert.equal(status, 'void');
});
