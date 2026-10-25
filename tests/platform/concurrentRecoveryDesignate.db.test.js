'use strict';
// Simultaneous indirect cost recovery runs and board designations post once. Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { registerIndirectCostRecoveryRoutes } = require('../../server/organizational/routes/indirectCostRecovery');
const { registerBoardDesignationRoutes } = require('../../server/organizational/routes/boardDesignations');

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

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Rec ${stamp}`, `rec-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`rec-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await scoped.query(`INSERT INTO org_programs (org_id, name, is_default) VALUES ($1, 'General', true) RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.cash = await acct('1000', 'asset');
    w.expense = await acct('6000', 'expense');
    w.recoveryIncome = await acct('4900', 'income');
    w.recoveryReceivable = await acct('1200', 'asset');
    w.undesignated = await acct('3000', 'equity');
    w.designated = await acct('3100', 'equity');
  });
  return w;
}

function call(handler, w, req) {
  return inOrg(w, async () => {
    const out = { status: 200, body: null };
    const res = { status(s) { out.status = s; return res; }, json(b) { out.body = b; return res; }, send() { return res; }, setHeader() {} };
    await handler({ orgId: w.orgId, coopOrgRole: 'admin', user: { id: w.userId, user_id: w.userId }, params: { slug: 'x', ...(req.params || {}) }, query: {}, body: req.body || {}, headers: {}, ip: '127.0.0.1' }, res);
    return out;
  });
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 10 });
  scoped = wrapPoolWithOrgScoping(pool);
  const app = { get() {}, put() {}, patch() {}, delete() {}, post: (p, ...h) => { routes[p] = h[h.length - 1]; } };
  registerIndirectCostRecoveryRoutes(app, scoped);
  registerBoardDesignationRoutes(app, scoped);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous indirect cost recovery runs post each grant once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const grantId = await inOrg(w, async () => {
    const id = (await scoped.query(
      `INSERT INTO org_grants (org_id, name, indirect_cost_rate_type, indirect_cost_rate_bps) VALUES ($1, 'Grant A', 'de_minimis', 1000) RETURNING id`, [w.orgId])).rows[0].id;
    const r = await postLedgerTransaction(scoped, {
      orgId: w.orgId, userId: w.userId, transactionDate: '2026-02-15', memo: 'Grant spending', source: 'manual', internalApproval: null,
      lines: [
        { account_id: w.expense, program_id: w.program, grant_id: id, debit_cents: 100000, credit_cents: 0 },
        { account_id: w.cash, program_id: w.program, debit_cents: 0, credit_cents: 100000 },
      ],
    });
    assert.ok(r.httpStatus < 400, JSON.stringify(r.body));
    return id;
  });
  const h = routes['/api/organizational/orgs/:slug/indirect-cost-recovery/run'];
  const body = { period_start_date: '2026-01-01', period_end_date: '2026-03-31', debit_account_id: w.recoveryReceivable, credit_account_id: w.recoveryIncome, program_id: w.program };
  const outs = await Promise.all(Array.from({ length: 5 }, () => call(h, w, { body })));
  assert.ok(outs.every((o) => o.status === 200), JSON.stringify(outs));
  assert.equal(outs.reduce((s, o) => s + o.body.posted_count, 0), 1, JSON.stringify(outs.map((o) => o.body)));
  const r = (await inOrg(w, () => scoped.query(
    `SELECT (SELECT COUNT(*) FROM org_ledger_transactions WHERE org_id = $1 AND source = 'indirect_cost_recovery' AND status = 'posted')::int AS posted,
            (SELECT COUNT(*) FROM org_ledger_transactions WHERE org_id = $1 AND source = 'indirect_cost_recovery')::int AS total,
            (SELECT COUNT(*) FROM org_indirect_cost_recovery_entries WHERE org_id = $1 AND grant_id = $2)::int AS tracked`, [w.orgId, grantId]))).rows[0];
  assert.equal(r.posted, 1);
  assert.equal(r.total, 1);
  assert.equal(r.tracked, 1);
});

test('five simultaneous designations that only fit once post one entry', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const designationId = await inOrg(w, async () => {
    const r = await postLedgerTransaction(scoped, {
      orgId: w.orgId, userId: w.userId, transactionDate: '2026-02-15', memo: 'Opening net assets', source: 'manual', internalApproval: null,
      lines: [
        { account_id: w.cash, program_id: w.program, debit_cents: 100000, credit_cents: 0 },
        { account_id: w.undesignated, program_id: w.program, debit_cents: 0, credit_cents: 100000 },
      ],
    });
    assert.ok(r.httpStatus < 400, JSON.stringify(r.body));
    return (await scoped.query(`INSERT INTO org_board_designations (org_id, name, status, created_by) VALUES ($1, 'Reserve', 'active', $2) RETURNING id`, [w.orgId, w.userId])).rows[0].id;
  });
  const h = routes['/api/organizational/orgs/:slug/board-designations/:id/transfer'];
  const body = { direction: 'designate', amount_cents: 80000, undesignated_account_id: w.undesignated, designated_account_id: w.designated, transaction_date: '2026-03-01' };
  const outs = await Promise.all(Array.from({ length: 5 }, () => call(h, w, { params: { id: String(designationId) }, body })));
  assert.equal(outs.filter((o) => o.status < 300).length, 1, JSON.stringify(outs.map((o) => [o.status, o.body])));
  const n = (await inOrg(w, () => scoped.query(
    `SELECT COUNT(DISTINCT t.id)::int AS n FROM org_ledger_transactions t JOIN org_ledger_lines l ON l.transaction_id = t.id
      WHERE t.org_id = $1 AND t.status = 'posted' AND l.board_designation_id = $2`, [w.orgId, designationId]))).rows[0].n;
  assert.equal(n, 1);
});
