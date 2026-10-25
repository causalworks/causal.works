'use strict';
// Proposals queue: an assistant's call is stored, nothing changes, and a person accepts, changes or dismisses it once.
// Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { runTool, proposals } = require('../../server/organizational/tools');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(w, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(w.userId); fn().then(resolve, reject); });
  });
}
const ctx = (w, actor = 'human', extra = {}) => ({ pool: scoped, orgId: w.orgId, userId: w.userId, actor, programScope: null, meta: {}, ...extra });

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Prop ${stamp}`, `prop-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`prop-${stamp}@example.test`])).rows[0];
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
    const who = (await q(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Counterparty', 'organization') RETURNING id`, [w.orgId])).rows[0].id;
    await q('INSERT INTO org_contact_roles (org_id, constituent_id, role) VALUES ($1, $2, $3)', [w.orgId, who, 'vendor']);
    w.bill = (await q(`INSERT INTO org_bills (org_id, constituent_id, bill_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'approved', 2026) RETURNING id`, [w.orgId, who])).rows[0].id;
    await q(`INSERT INTO org_bill_lines (bill_id, account_id, program_id, amount_cents) VALUES ($1, $2, $3, 10000)`, [w.bill, w.expense, w.program]);
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

const paymentInput = (w, cents) => ({ id: w.bill, bank_account_id: w.bank, payment_date: '2026-03-15', amount_cents: cents });
const paymentCount = (w) => inOrg(w, () => scoped.query(`SELECT count(*)::int AS n FROM org_bill_payments WHERE bill_id = $1 AND status = 'posted'`, [w.bill])).then((r) => r.rows[0].n);

test('an assistant call is stored with its reason and changes nothing', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const out = await inOrg(w, () => runTool('bill.record_payment', ctx(w, 'assistant', { proposal: { reason: 'matches the bank line', model: 'm', promptVersion: 'v1' } }), paymentInput(w, 4000)));
  assert.equal(out.httpStatus, 202);
  assert.ok(out.body.proposal_id);
  assert.equal(await paymentCount(w), 0);
  const open = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  assert.equal(open.length, 1);
  assert.equal(open[0].reason, 'matches the bank line');
  assert.equal(open[0].proposer_kind, 'assistant');
});

test('accepting runs the tool once even when decided five times at once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const p = await inOrg(w, () => runTool('bill.record_payment', ctx(w, 'job'), paymentInput(w, 10000)));
  const results = await Promise.all(Array.from({ length: 5 }, () => inOrg(w, () => proposals.acceptProposal(ctx(w), p.body.proposal_id))));
  assert.equal(results.filter((r) => r.httpStatus === 201).length, 1);
  assert.equal(results.filter((r) => r.httpStatus === 409).length, 4);
  assert.equal(await paymentCount(w), 1);
  const done = await inOrg(w, () => proposals.listProposals(scoped, w.orgId, { status: 'accepted' }));
  assert.equal(done.length, 1);
  assert.equal(done[0].result_status, 201);
});

test('accepting with changes runs the changed input and marks it changed', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const p = await inOrg(w, () => runTool('bill.record_payment', ctx(w, 'assistant'), paymentInput(w, 4000)));
  const out = await inOrg(w, () => proposals.acceptProposal(ctx(w), p.body.proposal_id, paymentInput(w, 3000)));
  assert.equal(out.httpStatus, 201);
  const row = (await inOrg(w, () => proposals.listProposals(scoped, w.orgId, { status: 'changed' })))[0];
  assert.equal(row.final_input.amount_cents, 3000);
  assert.equal(row.input.amount_cents, 4000);
});

test('a refused tool run leaves the proposal open; dismiss closes it; assistants cannot decide', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const p = await inOrg(w, () => runTool('bill.record_payment', ctx(w, 'assistant'), paymentInput(w, 4000)));
  const bad = await inOrg(w, () => proposals.acceptProposal(ctx(w), p.body.proposal_id, { ...paymentInput(w, 4000), amount_cents: -5 }));
  assert.equal(bad.httpStatus, 400);
  assert.equal((await inOrg(w, () => proposals.listProposals(scoped, w.orgId))).length, 1);
  assert.equal((await inOrg(w, () => proposals.acceptProposal(ctx(w, 'assistant'), p.body.proposal_id))).httpStatus, 403);
  assert.equal((await inOrg(w, () => proposals.dismissProposal(ctx(w), p.body.proposal_id))).httpStatus, 200);
  assert.equal((await inOrg(w, () => proposals.dismissProposal(ctx(w), p.body.proposal_id))).httpStatus, 409);
  assert.equal(await paymentCount(w), 0);
});

test('another workspace cannot see or decide a proposal', { skip: SKIP }, async () => {
  const a = await makeWorkspace();
  const b = await makeWorkspace();
  const p = await inOrg(a, () => runTool('bill.record_payment', ctx(a, 'assistant'), paymentInput(a, 4000)));
  assert.equal((await inOrg(b, () => proposals.listProposals(scoped, b.orgId))).length, 0);
  assert.equal((await inOrg(b, () => proposals.dismissProposal(ctx(b), p.body.proposal_id))).httpStatus, 409);
});
