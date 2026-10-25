'use strict';
// Payment tools: the registry refuses a human-only tool to an assistant, and simultaneous payments against one bill or invoice post once.
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

function ctx(w, actor = 'human') {
  return { pool: scoped, orgId: w.orgId, userId: w.userId, actor, programScope: null, meta: {} };
}

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Tool ${stamp}`, `tool-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`tool-${stamp}@example.test`])).rows[0];
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
    w.income = await acct('4000', 'income');
    const who = (await q(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Counterparty', 'organization') RETURNING id`, [w.orgId])).rows[0].id;
    for (const role of ['vendor', 'customer']) await q('INSERT INTO org_contact_roles (org_id, constituent_id, role) VALUES ($1, $2, $3)', [w.orgId, who, role]);
    w.bill = (await q(`INSERT INTO org_bills (org_id, constituent_id, bill_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'approved', 2026) RETURNING id`, [w.orgId, who])).rows[0].id;
    await q(`INSERT INTO org_bill_lines (bill_id, account_id, program_id, amount_cents) VALUES ($1, $2, $3, 10000)`, [w.bill, w.expense, w.program]);
    w.invoice = (await q(`INSERT INTO org_invoices (org_id, constituent_id, invoice_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'sent', 2026) RETURNING id`, [w.orgId, who])).rows[0].id;
    await q(`INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, quantity, unit_amount_cents) VALUES ($1, $2, $3, 1, 10000)`, [w.invoice, w.income, w.program]);
  });
  return w;
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 10 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('an assistant gets a proposal for a void and nothing changes until a person runs it', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const paid = await inOrg(w, () => runTool('bill.record_payment', ctx(w), { id: w.bill, bank_account_id: w.bank, payment_date: '2026-03-15', amount_cents: 4000 }));
  assert.equal(paid.httpStatus, 201);
  const input = { id: w.bill, payment_id: paid.body.id, reason: 'entered twice' };
  const proposal = await inOrg(w, () => runTool('bill.void_payment', ctx(w, 'assistant'), input));
  assert.equal(proposal.httpStatus, 202);
  assert.equal(proposal.body.proposed, true);
  const status = () => inOrg(w, () => scoped.query('SELECT status FROM org_bill_payments WHERE id = $1', [paid.body.id])).then((r) => r.rows[0].status);
  assert.equal(await status(), 'posted');
  const confirmed = await inOrg(w, () => runTool('bill.void_payment', ctx(w), input));
  assert.equal(confirmed.httpStatus, 200);
  assert.equal(await status(), 'void');
});

for (const [kind, key, payTable, fk] of [['bill', 'bill', 'org_bill_payments', 'bill_id'], ['invoice', 'invoice', 'org_invoice_payments', 'invoice_id']]) {
  test(`five simultaneous full payments of one ${kind} post once`, { skip: SKIP }, async () => {
    const w = await makeWorkspace();
    const input = { id: w[key], bank_account_id: w.bank, payment_date: '2026-03-15', amount_cents: 10000 };
    const results = await Promise.all(Array.from({ length: 5 }, () => inOrg(w, () => runTool(`${kind}.record_payment`, ctx(w), input))));
    const created = results.filter((r) => r.httpStatus === 201).length;
    assert.equal(created, 1, JSON.stringify(results.map((r) => r.httpStatus)));
    const n = (await inOrg(w, () => scoped.query(`SELECT COUNT(*)::int AS n FROM ${payTable} WHERE ${fk} = $1 AND status = 'posted'`, [w[key]]))).rows[0].n;
    assert.equal(n, 1);
    const ledger = (await inOrg(w, () => scoped.query(
      `SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = $2 AND status = 'posted'`, [w.orgId, `${kind}_payment`]))).rows[0].n;
    assert.equal(ledger, 1);
  });
}
