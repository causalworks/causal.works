'use strict';
// Designate and release transfers: posted as balanced equity entries, limited to the available net assets and the designation's balance. Needs SMOKE_DATABASE_URL (see freshWorkspace.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { buildFinancialPosition } = require('../../server/organizational/lib/financialPositionStatement');
const { registerBoardDesignationRoutes } = require('../../server/organizational/routes/boardDesignations');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(orgId); fn().then(resolve, reject); });
  });
}

function transferHandler() {
  let handler;
  const app = { get() {}, patch() {}, post(path, ...fns) { if (path.endsWith('/transfer')) handler = fns[fns.length - 1]; } };
  registerBoardDesignationRoutes(app, scoped);
  return handler;
}

function call(handler, req) {
  return new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    handler(req, res);
  });
}

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Transfer ${stamp}`, `transfer-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`transfer-${stamp}@example.test`])).rows[0];
  return inOrg(org.id, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [org.id]);
    const program = (await scoped.query(`INSERT INTO org_programs (org_id, name, is_default) VALUES ($1, 'General', true) RETURNING id`, [org.id])).rows[0].id;
    const acct = async (code, name, type, cash = false) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account) VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`,
      [org.id, code, name, type, cash])).rows[0].id;
    const designation = (await scoped.query(`INSERT INTO org_board_designations (org_id, name) VALUES ($1, 'Reserve') RETURNING id`, [org.id])).rows[0].id;
    const w = {
      orgId: org.id, userId: user.id, program, designation,
      bank: await acct('1000', 'Operating', 'asset', true),
      undesignated: await acct('3100', 'Net Assets Without Donor Restrictions', 'equity'),
      designated: await acct('3300', 'Board-Designated Reserve', 'equity'),
      income: await acct('4000', 'Grants', 'income'),
    };
    await postLedgerTransaction(scoped, {
      orgId: org.id, userId: user.id, transactionDate: '2026-03-01', memo: 'Opening', source: 'manual', internalApproval: null,
      lines: [{ account_id: w.bank, program_id: program, debit_cents: 100000 }, { account_id: w.undesignated, program_id: program, credit_cents: 100000 }],
    });
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

test('designate and release move amounts between equity accounts and respect the limits', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const h = transferHandler();
    const req = (extra) => ({ params: { id: String(w.designation) }, orgId: w.orgId, user: { id: w.userId },
      body: { direction: 'designate', amount_cents: 40000, transaction_date: '2026-04-01', undesignated_account_id: w.undesignated, designated_account_id: w.designated, ...extra } });

    let r = await call(h, req({}));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    let st = await buildFinancialPosition(scoped, w.orgId, 2026);
    assert.strictEqual(st.net_assets.board_designated, 40000);
    assert.strictEqual(st.net_assets.undesignated, 60000);

    r = await call(h, req({ amount_cents: 70000 }));
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.code, 'designation_exceeds_available');

    r = await call(h, req({ direction: 'release', amount_cents: 50000 }));
    assert.strictEqual(r.status, 422);
    assert.strictEqual(r.body.code, 'release_exceeds_balance');

    r = await call(h, req({ direction: 'release', amount_cents: 15000 }));
    assert.strictEqual(r.status, 201, JSON.stringify(r.body));
    st = await buildFinancialPosition(scoped, w.orgId, 2026);
    assert.strictEqual(st.net_assets.board_designated, 25000);
    assert.strictEqual(st.net_assets.undesignated, 75000);
    assert.strictEqual(st.net_assets.without_restrictions, 100000);

    r = await call(h, req({ designated_account_id: w.bank }));
    assert.strictEqual(r.status, 400);
  });
});
