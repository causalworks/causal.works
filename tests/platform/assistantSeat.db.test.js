'use strict';
// Assistant seat and mode: no seat or mode off means no assistant context; a granted seat expires and can be revoked; its proposals carry the seat.
// Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { runTool, proposals } = require('../../server/organizational/tools');
const seat = require('../../server/organizational/lib/assistantSeat');

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


const run = (w, fn) => inOrg(w, fn);
const setup = (w) => run(w, async () => { await scoped.query(`UPDATE org_settings SET assistant_mode = 'background' WHERE org_id = $1`, [w.orgId]); });
const paymentInput = (w) => ({ id: w.bill, bank_account_id: w.bank, payment_date: '2026-03-15', amount_cents: 4000 });

test('no context without a live seat, none while the mode is off', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  assert.match((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId }))).refused, /off/);
  await setup(w);
  assert.match((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId }))).refused, /no live seat/);
  assert.equal((await run(w, () => seat.grantSeat(scoped, { orgId: w.orgId, userId: w.userId, reason: 'bank coding trial' }))).httpStatus, 201);
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId }))).ctx);
});

test('a person can switch the assistant off for themselves', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await setup(w);
  await run(w, () => scoped.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, 'admin')`, [w.orgId, w.userId]));
  await run(w, () => seat.grantSeat(scoped, { orgId: w.orgId, userId: w.userId, reason: 'bank coding trial' }));
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId, forUserId: w.userId }))).ctx);
  await run(w, () => seat.setUserMode(scoped, w.orgId, w.userId, 'off'));
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId, forUserId: w.userId }))).refused);
  await run(w, () => seat.setUserMode(scoped, w.orgId, w.userId, null));
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId, forUserId: w.userId }))).ctx);
});

test('revoking or ending the seat stops the assistant; renewing extends it; one live seat at a time', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await setup(w);
  const grant = () => seat.grantSeat(scoped, { orgId: w.orgId, userId: w.userId, reason: 'bank coding trial' });
  assert.equal((await run(w, grant)).httpStatus, 201);
  assert.equal((await run(w, grant)).httpStatus, 409);
  assert.equal((await run(w, () => seat.renewSeat(scoped, { orgId: w.orgId, days: 60 }))).httpStatus, 200);
  assert.equal((await run(w, () => seat.revokeSeat(scoped, { orgId: w.orgId, userId: w.userId }))).httpStatus, 200);
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId }))).refused);
  await run(w, grant);
  await run(w, () => scoped.query(`UPDATE org_assistant_seats SET starts_at = now() - interval '40 days', ends_at = now() - interval '1 day' WHERE org_id = $1 AND revoked_at IS NULL`, [w.orgId]));
  assert.ok((await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId }))).refused);
  assert.equal((await run(w, grant)).httpStatus, 201);
});

test('the assistant can propose but a proposal made under its seat changes nothing and records the seat', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await setup(w);
  await run(w, () => seat.grantSeat(scoped, { orgId: w.orgId, userId: w.userId, reason: 'bank coding trial' }));
  const { ctx } = await run(w, () => seat.assistantContext(scoped, { orgId: w.orgId, proposal: { reason: 'same as past payments' } }));
  const out = await run(w, () => runTool('bill.record_payment', ctx, paymentInput(w)));
  assert.equal(out.httpStatus, 202);
  const row = (await run(w, () => proposals.listProposals(scoped, w.orgId)))[0];
  assert.ok(row.id);
  const stored = (await run(w, () => scoped.query('SELECT proposer_seat_id, proposer_user_id FROM org_tool_proposals WHERE id = $1', [row.id]))).rows[0];
  assert.equal(stored.proposer_seat_id, ctx.seatId);
  assert.equal(stored.proposer_user_id, null);
  const n = (await run(w, () => scoped.query(`SELECT count(*)::int AS n FROM org_bill_payments WHERE bill_id = $1`, [w.bill]))).rows[0].n;
  assert.equal(n, 0);
});
