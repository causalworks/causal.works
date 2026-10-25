'use strict';
// Simultaneous requests to money actions post exactly once. Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { registerFixedAssetRoutes } = require('../../server/organizational/routes/fixedAssets');
const { registerCreditNotesRoutes } = require('../../server/organizational/routes/creditNotes');

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
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Conc ${stamp}`, `conc-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`conc-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await scoped.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.asset = await acct('1500', 'asset');
    w.accum = await acct('1590', 'asset');
    w.expense = await acct('6500', 'expense');
    w.income = await acct('4000', 'income');
  });
  return w;
}

function call(handler, w, req) {
  return inOrg(w, async () => {
    const out = { status: 200, body: null };
    const res = { status(s) { out.status = s; return res; }, json(b) { out.body = b; return res; }, send() { return res; }, setHeader() {} };
    await handler({ orgId: w.orgId, user: { id: w.userId, user_id: w.userId }, params: { slug: 'x', ...(req.params || {}) }, query: {}, body: req.body || {}, headers: {}, ip: '127.0.0.1' }, res);
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
  registerFixedAssetRoutes(app, scoped);
  registerCreditNotesRoutes(app, scoped);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous depreciation runs post each period once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w, () => scoped.query(
    `INSERT INTO org_fixed_assets (org_id, name, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
        acquisition_date, cost_cents, useful_life_months, program_id) VALUES ($1, 'Laptop', $2, $3, $4, '2026-01-31', 120000, 12, $5)`,
    [w.orgId, w.asset, w.accum, w.expense, w.program]));
  const h = routes['/api/organizational/orgs/:slug/fixed-assets/run-depreciation'];
  await Promise.all(Array.from({ length: 5 }, () => call(h, w, { body: { through_date: '2026-03-31' } })));
  const r = (await inOrg(w, () => scoped.query(
    `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS expense,
            (SELECT COUNT(*) FROM org_fixed_asset_depreciation_entries WHERE org_id = $1)::int AS tracked
       FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
      WHERE t.org_id = $1 AND t.status = 'posted' AND l.account_id = $2`, [w.orgId, w.expense]))).rows[0];
  assert.equal(String(r.expense), '30000');
  assert.equal(r.tracked, 3);
});

test('five simultaneous applies of one credit note post one entry', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const contact = await inOrg(w, async () => {
    const c = (await scoped.query(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Customer', 'individual') RETURNING id`, [w.orgId])).rows[0].id;
    await scoped.query(`INSERT INTO org_contact_roles (org_id, constituent_id, role) VALUES ($1, $2, 'customer')`, [w.orgId, c]);
    return c;
  });
  const note = (await inOrg(w, () => scoped.query(
    `INSERT INTO org_invoice_credit_notes (org_id, constituent_id, account_id, program_id, amount_cents, fiscal_year, note_date, created_by)
     VALUES ($1, $2, $3, $4, 50000, 2026, '2026-03-01', $5) RETURNING id`, [w.orgId, contact, w.income, w.program, w.userId]))).rows[0].id;
  const h = routes['/api/organizational/orgs/:slug/invoice-credit-notes/:id/apply'];
  const results = await Promise.all(Array.from({ length: 5 }, () => call(h, w, { params: { id: String(note) } })));
  assert.equal(results.filter((x) => x.status === 200).length, 1);
  const n = (await inOrg(w, () => scoped.query(
    `SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND status = 'posted' AND memo = $2`, [w.orgId, 'Credit note #' + note]))).rows[0].n;
  assert.equal(n, 1);
});

test('first-use receivable account creation is safe under simultaneous requests', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const ids = await Promise.all(Array.from({ length: 5 }, () => inOrg(w, async () => (await scoped.query('SELECT org_get_or_create_ar_account($1) AS id', [w.orgId])).rows[0].id)));
  assert.equal(new Set(ids).size, 1);
});

test('five simultaneous disposals of one asset post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const assetId = (await inOrg(w, () => scoped.query(
    `INSERT INTO org_fixed_assets (org_id, name, asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
        acquisition_date, cost_cents, useful_life_months, program_id) VALUES ($1, 'Desk', $2, $3, $4, '2026-01-31', 120000, 12, $5) RETURNING id`,
    [w.orgId, w.asset, w.accum, w.expense, w.program]))).rows[0].id;
  const h = routes['/api/organizational/orgs/:slug/fixed-assets/:id/dispose'];
  const outs = await Promise.all(Array.from({ length: 5 }, () => call(h, w, { params: { id: String(assetId) }, body: { disposal_date: '2026-06-30', gain_loss_account_id: w.income } })));
  assert.equal(outs.filter((o) => o.status === 200).length, 1, JSON.stringify(outs.map((o) => o.status)));
  const n = (await inOrg(w, () => scoped.query(`SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = 'fixed_asset_disposal' AND status = 'posted'`, [w.orgId]))).rows[0].n;
  assert.equal(n, 1);
});
