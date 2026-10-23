'use strict';

// Two requests at once against a throwaway database: each ledger posting and each approval must happen exactly once.
// Rows are committed (not rolled back) so separate connections can race; the database is throwaway.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const opts = { skip: h.SKIP };

let realPool = null;
function getPool() {
  if (!realPool) {
    const { Pool } = require('pg');
    realPool = new Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 12 });
  }
  return realPool;
}

async function blocked(t) {
  const r = await getPool().query(`SELECT (SELECT relrowsecurity FROM pg_class WHERE relname = 'org_accounts') AS rls,
    (SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass`);
  if (!r.rows[0].rls || r.rows[0].bypass) return false;
  t.skip('Needs a throwaway database user that row-level security does not hold back (a superuser, or a database without it).');
  return true;
}
test.after(async () => { if (realPool) await realPool.end(); });

const money = () => require('../../server/organizational/lib/sponsorMoneyOut');
const grants = () => require('../../server/organizational/lib/sponsorGrants');
const dues = () => require('../../server/organizational/lib/membershipAccounting');
const payEvents = () => require('../../server/organizational/lib/membershipPayments');

async function sponsorSetup(pool, giftCents) {
  const ws = await h.seedWorkspace(pool);
  const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 0 } });
  await h.seedPostedGift(pool, ws, project, giftCents, '2026-01-15');
  const payee = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Venue vendor', 'organization') RETURNING id`, [ws.orgId]);
  return { ws, project, payee };
}

const codes = (results) => results.map((r) => r.httpStatus).sort();
const ledgerCount = async (pool, orgId, source) =>
  Number((await pool.query(`SELECT count(*) FROM org_ledger_transactions WHERE org_id = $1 AND source = $2 AND status <> 'voided'`, [orgId, source])).rows[0].count);

test('a recall posted three times at once reaches the ledger once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const { ws, project } = await sponsorSetup(pool, 100000);
  const rc = await money().createRecall(pool, { orgId: ws.orgId, userId: ws.users[1].id, projectId: project.id, input: { amount_cents: 30000, reason: 'Terms broken', recall_date: '2026-03-01' } });
  const recallId = rc.body.recall.id;
  const results = await Promise.all([1, 2, 3].map(() => money().postRecall(pool, { orgId: ws.orgId, userId: ws.users[1].id, recallId })));
  assert.deepEqual(codes(results), [200, 409, 409]);
  assert.equal(await ledgerCount(pool, ws.orgId, 'sponsor_recall'), 1);
});

test('a closing posted twice at once reaches the ledger once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const { ws, project, payee } = await sponsorSetup(pool, 100000);
  await pool.query(`UPDATE org_sponsored_projects SET status = 'winding_down' WHERE id = $1`, [project.id]);
  const c = await grants().createClosing(pool, { orgId: ws.orgId, userId: ws.users[1].id, projectId: project.id,
    input: { destination_kind: 'project_charity', destination_constituent_id: payee.id, amount_cents: 50000, closing_date: '2026-06-30', reason: 'Project ended' } });
  assert.equal(c.httpStatus, 201, JSON.stringify(c.body));
  const args = { orgId: ws.orgId, userId: ws.users[1].id, closingId: c.body.closing.id, bankAccountId: ws.accounts.bank, expenseAccountId: ws.accounts.projectExpense };
  const results = await Promise.all([1, 2].map(() => grants().postClosing(pool, args)));
  assert.deepEqual(codes(results), [200, 409]);
  assert.equal(await ledgerCount(pool, ws.orgId, 'sponsor_closing'), 1);
});

test('one payment request approved by two people at once pays out once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const { ws, project, payee } = await sponsorSetup(pool, 100000);
  const rq = await money().createRequest(pool, { orgId: ws.orgId, userId: ws.users[3].id, projectId: project.id, input: { payee_constituent_id: payee.id, amount_cents: 60000, purpose: 'Venue' } });
  assert.equal(rq.httpStatus, 201, JSON.stringify(rq.body));
  const review = (u) => money().reviewRequest(pool, { orgId: ws.orgId, userId: ws.users[u].id, role: 'finance', projectId: project.id, requestId: rq.body.request.id, action: 'approve' });
  const results = await Promise.all([review(1), review(4)]);
  assert.deepEqual(codes(results), [200, 409]);
  const d = await pool.query(`SELECT count(*) FROM org_sponsored_project_disbursements WHERE org_id = $1 AND payment_request_id = $2 AND status <> 'void'`, [ws.orgId, rq.body.request.id]);
  assert.equal(Number(d.rows[0].count), 1);
});

test('two requests that together exceed the balance cannot both be created at once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const { ws, project, payee } = await sponsorSetup(pool, 100000);
  const make = () => money().createRequest(pool, { orgId: ws.orgId, userId: ws.users[3].id, projectId: project.id, input: { payee_constituent_id: payee.id, amount_cents: 60000, purpose: 'Venue' } });
  const results = await Promise.all([make(), make()]);
  assert.deepEqual(codes(results), [201, 409]);
});

async function duesSetup(pool) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Arts Collective', 'conc-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, ['finance-' + Math.floor(Math.random() * 1e9) + '@example.test']);
  await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, 'finance'::org_member_role)`, [org.id, u.id]);
  const acct = async (code, name, type, cash) => (await h.one(pool,
    `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account) VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`,
    [org.id, code, name, type, !!cash])).id;
  const accounts = { bank: await acct('1000', 'Operating bank', 'asset', true), deferred: await acct('2400', 'Dues received in advance', 'liability'),
    dues: await acct('4100', 'Membership dues', 'income'), contrib: await acct('4000', 'Contributions', 'income') };
  const program = (await h.one(pool, `INSERT INTO org_programs (org_id, name) VALUES ($1, 'Membership') RETURNING id`, [org.id])).id;
  const routes = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const call = async (method, path, body, params) => routes.call(method, '/api/organizational/orgs/:slug/membership' + path,
    { user: u.id, role: 'admin', orgId: org.id, params: { slug: org.slug, ...(params || {}) }, body });
  let res = await call('PUT', '/settings', { deferred_dues_account_id: accounts.deferred, contribution_account_id: accounts.contrib, dues_revenue_account_id: accounts.dues, default_program_id: program });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  res = await call('POST', '/tiers', { name: 'Standard', price: '365', effective_on: '2020-01-01' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const tier = res.body.tier;
  res = await call('POST', '/dues-members', { tier_id: tier.id, starts_on: '2026-07-01', contact: { display_name: 'Holder ' + Math.floor(Math.random() * 1e6) } });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  res = await call('POST', '/terms/:id/payments', { amount: '365', payment_date: '2026-07-03' }, { id: String(res.body.term_id) });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  return { org, userId: u.id, accounts, paymentId: res.body.payment_id };
}

test('a dues payment posted three times at once reaches the ledger once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const s = await duesSetup(pool);
  const args = { orgId: s.org.id, userId: s.userId, paymentId: s.paymentId, postingDate: '2026-07-03', depositAccountId: s.accounts.bank };
  const results = await Promise.all([1, 2, 3].map(() => dues().postDuesPayment(pool, args)));
  assert.deepEqual(codes(results), [200, 409, 409]);
  assert.equal(await ledgerCount(pool, s.org.id, 'membership_dues'), 1);
});

test('a dues posting reversed twice at once is reversed once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const s = await duesSetup(pool);
  const posted = await dues().postDuesPayment(pool, { orgId: s.org.id, userId: s.userId, paymentId: s.paymentId, postingDate: '2026-07-03', depositAccountId: s.accounts.bank });
  assert.equal(posted.httpStatus, 200, JSON.stringify(posted.body));
  const results = await Promise.all([1, 2].map(() => dues().reverseDuesPosting(pool, { orgId: s.org.id, userId: s.userId, paymentId: s.paymentId, reason: 'Entered in error' })));
  assert.deepEqual(codes(results), [200, 409]);
  assert.equal(await ledgerCount(pool, s.org.id, 'membership_dues'), 2);
});

test('two recognition runs for one month at once leave one ledger entry and no stray entry', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const s = await duesSetup(pool);
  const posted = await dues().postDuesPayment(pool, { orgId: s.org.id, userId: s.userId, paymentId: s.paymentId, postingDate: '2026-07-03', depositAccountId: s.accounts.bank });
  assert.equal(posted.httpStatus, 200, JSON.stringify(posted.body));
  const before = await ledgerCount(pool, s.org.id, 'membership_dues');
  const results = await Promise.all([1, 2].map(() => dues().postRecognition(pool, { orgId: s.org.id, userId: s.userId, month: '2026-07' })));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, JSON.stringify(results.map((r) => r.body)));
  assert.equal(results.filter((r) => r.httpStatus >= 500).length, 0);
  assert.equal(await ledgerCount(pool, s.org.id, 'membership_dues'), before + 1);
});

test('an in-kind gift posted three times at once reaches the ledger once', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const ws = await h.seedWorkspace(pool);
  const gift = await h.one(pool,
    `INSERT INTO org_gifts (org_id, gift_type, payment_method, amount_cents, received_at, posting_status, in_kind_description, program_id)
     VALUES ($1, 'donation', 'in_kind', 25000, '2026-02-01', 'unposted', 'Donated goods', $2) RETURNING id`, [ws.orgId, ws.programs.admin]);
  const args = { orgId: ws.orgId, userId: ws.users[1].id, giftId: gift.id, postingDate: '2026-02-01', revenueAccountId: ws.accounts.contributions, expenseAccountId: ws.accounts.projectExpense };
  const results = await Promise.all([1, 2, 3].map(() => require('../../server/organizational/lib/giftPosting').postInKindGift(pool, args)));
  assert.deepEqual(codes(results), [200, 409, 409]);
  assert.equal(await ledgerCount(pool, ws.orgId, 'gift_in_kind'), 1);
});

test('two refund events with different refund ids at once never refund more than the payment', opts, async (t) => {
  if (await blocked(t)) return;
  const pool = getPool();
  const ws = await h.seedWorkspace(pool);
  const person = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Dues payer', 'individual') RETURNING id`, [ws.orgId]);
  const term = await h.one(pool, `INSERT INTO org_membership_terms (org_id, constituent_id, starts_on, ends_on) VALUES ($1, $2, '2026-01-01', '2026-12-31') RETURNING id`, [ws.orgId, person.id]);
  const ref = 'pi_race_' + ws.orgId;
  await pool.query(
    `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, processor_ref, posting_status)
     VALUES ($1, $2, $3, 'payment', 'card', 1000, $4, 'unposted')`, [ws.orgId, term.id, person.id, ref]);
  const send = (id) => payEvents().handleEvent(pool, ws.orgId, { kind: 'refunded', orgId: ws.orgId, paymentRef: ref, refunds: [{ id: id + ws.orgId, amountCents: 700 }] });
  await Promise.all([send('re_one_'), send('re_two_')]);
  const total = (await pool.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS s FROM org_membership_payments WHERE org_id = $1 AND kind = 'refund'`, [ws.orgId])).rows[0].s;
  assert.equal(total, 1000);
});
