'use strict';

// Membership card payments against a throwaway database with the fake provider: credentials stored encrypted, hosted
// checkout, signed webhooks (a bad signature is refused, a replayed event changes nothing, a failed payment never
// extends a term), subscriptions and monthly instalments, refunds through the provider, and invoices for a term.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

process.env.POD_CREDENTIAL_ENCRYPTION_KEY = process.env.POD_CREDENTIAL_ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');

const h = require('../sponsorship/helpers');
const payments = require('../../server/organizational/lib/payments');
const fake = require('../../server/organizational/lib/payments/fakeProvider');
const { signatureHeader } = require('../../server/organizational/lib/payments/signature');
const { issueFormToken } = require('../../server/organizational/lib/publicLinks');
const mailer = require('../../server/organizational/lib/sendPlainEmail');
const S = require('../../server/organizational/lib/membershipStatus');
const M = require('../../server/organizational/lib/membership');

payments.PROVIDERS.stripe = fake;
mailer.sendPlainEmail = async () => true;

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';
const P = '/api/public/:slug/membership';
const WEBHOOK = '/api/public/:slug/payments/:provider/webhook';
const SECRET = 'sk_test_' + 'a'.repeat(24);
const WHSEC = 'whsec_' + 'b'.repeat(24);
let n = 0;

async function setup(pool, asApp) {
  fake.reset();
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Credit Union Members', 'pay-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const users = {};
  for (const role of ['admin', 'finance', 'fundraising']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  await asApp(org.id);
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const pub = h.loadRoutes('public/membership.js', 'registerPublicMembershipRoutes', pool);
  const hook = h.loadRoutes('public/payments.js', 'registerPaymentWebhookRoutes', pool);
  const as = (role, extra) => ({ user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
  const scall = async (method, path, role, extra, expect) => {
    const res = await staff.call(method, B + path, as(role, extra));
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + path + ' ' + JSON.stringify(res.body));
    return res;
  };
  const send = (event, secret) => {
    const body = { id: 'evt_' + (++n), ...event };
    return hook.call('POST', WEBHOOK, { params: { slug: org.slug, provider: 'stripe' }, body, headers: { 'x-signature': signatureHeader(JSON.stringify(body), secret || WHSEC) } });
  };
  const resend = (body) => hook.call('POST', WEBHOOK, { params: { slug: org.slug, provider: 'stripe' }, body, headers: { 'x-signature': signatureHeader(JSON.stringify(body), WHSEC) } });
  const tier = async (body) => (await scall('POST', '/tiers', 'finance', { body: { name: 'Standard', price: '120', ...body } }, 201)).body.tier;
  const configure = async (extra) => {
    await scall('PUT', '/payment-account', 'finance', { body: { mode: 'test', secret_key: SECRET, webhook_secret: WHSEC } }, 200);
    await scall('PUT', '/settings', 'admin', { body: { card_payments_enabled: true, ...(extra || {}) } }, 200);
  };
  const holder = async (t, body) => (await scall('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, contact: { display_name: 'Holder ' + (++n), email: 'holder' + n + '@example.test' }, ...(body || {}) } }, 201)).body;
  const record = async (id) => (await scall('GET', '/dues-members/:id', 'finance', { params: { id: String(id) } }, 200)).body;
  return { org, users, staff, pub, hook, as, scall, send, resend, tier, configure, holder, record };
}

test('credentials: refused when they do not look right, stored encrypted, never returned; card payments need them first', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    assert.equal((await s.scall('PUT', '/payment-account', 'fundraising', { body: { mode: 'test', secret_key: SECRET } })).statusCode, 403);
    const live = await s.scall('PUT', '/payment-account', 'finance', { body: { mode: 'test', secret_key: 'sk_live_' + 'c'.repeat(24) } });
    assert.equal(live.statusCode, 400);
    const early = await s.scall('PUT', '/settings', 'admin', { body: { card_payments_enabled: true } });
    assert.equal(early.statusCode, 400);
    assert.match(early.body.error, /secret key and webhook secret/);
    await s.scall('PUT', '/payment-account', 'finance', { body: { mode: 'test', secret_key: SECRET, webhook_secret: WHSEC } }, 200);
    const got = await s.scall('GET', '/payment-account', 'admin', {}, 200);
    assert.deepEqual(got.body.accounts.map((a) => [a.mode, a.has_secret, a.has_webhook_secret]), [['test', true, true]]);
    assert.doesNotMatch(JSON.stringify(got.body), /sk_test_|whsec_/);
    const raw = await h.one(pool, `SELECT row_to_json(a)::text AS t FROM org_payment_accounts a WHERE org_id = $1`, [s.org.id]);
    assert.doesNotMatch(raw.t, /sk_test_|whsec_/);
    const log = await h.one(pool, `SELECT metadata::text AS m FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_payment_accounts'`, [s.org.id]);
    assert.doesNotMatch(log.m, /sk_test_|whsec_/);
    await s.scall('PUT', '/settings', 'admin', { body: { card_payments_enabled: true } }, 200);
    const toLive = await s.scall('PUT', '/settings', 'admin', { body: { payment_mode: 'live' } });
    assert.equal(toLive.statusCode, 400);
  });
});

test('webhook: a bad signature is refused; a paid checkout settles the term; a replayed event changes nothing', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.configure();
    const t = await s.tier();
    const j = await s.holder(t);
    const ev = { kind: 'payment_succeeded', orgId: s.org.id, termId: j.term_id, amountCents: 12000, paymentRef: 'pi_1', customerRef: 'cus_1' };
    const bad = await s.send(ev, 'whsec_' + 'z'.repeat(24));
    assert.equal(bad.statusCode, 400);
    assert.equal((await s.record(j.constituent_id)).status, 'pending');
    const ok = await s.send(ev);
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    let rec = await s.record(j.constituent_id);
    assert.equal(rec.status, 'active');
    assert.deepEqual(rec.payments.map((p) => [p.kind, p.method, p.amount_cents, p.processor_ref, p.posting_status]), [['payment', 'card', 12000, 'pi_1', 'unposted']]);
    const body = { id: 'evt_replay', ...ev, paymentRef: 'pi_2' };
    assert.equal((await s.resend(body)).statusCode, 200);
    const again = await s.resend(body);
    assert.equal(again.body.duplicate, true);
    const sameRef = await s.send({ ...ev, paymentRef: 'pi_1' });
    assert.equal(sameRef.statusCode, 200);
    rec = await s.record(j.constituent_id);
    assert.deepEqual(rec.payments.map((p) => p.processor_ref).sort(), ['pi_1', 'pi_2']);
    const events = await h.one(pool, `SELECT count(*)::int AS n FROM payment_provider_events WHERE org_id = $1`, [s.org.id]);
    assert.equal(events.n, 3);
    const other = await s.send({ ...ev, orgId: s.org.id + 1000, paymentRef: 'pi_other' });
    assert.equal(other.statusCode, 200);
    assert.equal((await s.record(j.constituent_id)).payments.length, 2);
  });
});

test('a failed payment never extends or settles a term; a later payment clears the failure', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.configure();
    const t = await s.tier();
    const j = await s.holder(t);
    await s.send({ kind: 'payment_failed', orgId: s.org.id, termId: j.term_id, paymentRef: 'pi_f' });
    const rec = await s.record(j.constituent_id);
    assert.equal(rec.status, 'pending');
    assert.equal(rec.terms.length, 1);
    assert.equal(rec.payments.length, 0);
    const term = await h.one(pool, 'SELECT payment_failed_at, ends_on FROM org_membership_terms WHERE id = $1', [j.term_id]);
    assert.ok(term.payment_failed_at);
    await s.send({ kind: 'payment_succeeded', orgId: s.org.id, termId: j.term_id, amountCents: 12000, paymentRef: 'pi_ok' });
    const after = await h.one(pool, 'SELECT payment_failed_at, ends_on FROM org_membership_terms WHERE id = $1', [j.term_id]);
    assert.equal(after.payment_failed_at, null);
    assert.equal(S.toDay(after.ends_on), S.toDay(term.ends_on));
  });
});

test('yearly subscription: linked to the term, the next yearly payment adds the renewal term, cancelling ends automatic renewal', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.configure();
    const t = await s.tier();
    const j = await s.holder(t, { starts_on: S.addDays(M.today(), -360) });
    await s.send({ kind: 'subscription_started', orgId: s.org.id, termId: j.term_id, subscriptionRef: 'sub_1', customerRef: 'cus_9', plan: 'yearly' });
    await s.send({ kind: 'payment_succeeded', orgId: s.org.id, termId: j.term_id, amountCents: 12000, paymentRef: 'in_1', subscriptionRef: 'sub_1', billingReason: 'subscription_create' });
    let rec = await s.record(j.constituent_id);
    assert.equal(rec.status, 'active');
    assert.equal(rec.terms[0].auto_renew, true);
    const first = rec.terms[0];
    const next = S.addDays(first.ends_on, 1);
    await s.send({ kind: 'payment_failed', orgId: s.org.id, subscriptionRef: 'sub_1' });
    assert.equal((await s.record(j.constituent_id)).terms.length, 1);
    await s.send({ kind: 'payment_succeeded', orgId: s.org.id, amountCents: 12000, paymentRef: 'in_2', subscriptionRef: 'sub_1', billingReason: 'subscription_cycle', periodStart: next });
    rec = await s.record(j.constituent_id);
    assert.equal(rec.terms.length, 2);
    assert.equal(rec.terms[0].starts_on, next);
    assert.equal(rec.terms[0].source, 'renewal');
    assert.equal(rec.terms[0].covered_cents, 12000);
    assert.equal(rec.terms[0].payment_failed_at, null);
    await s.send({ kind: 'subscription_cancelled', orgId: s.org.id, subscriptionRef: 'sub_1' });
    rec = await s.record(j.constituent_id);
    assert.deepEqual(rec.terms.map((x) => x.auto_renew), [false, false]);
  });
});

test('monthly instalments: one paid instalment keeps the term active; the account page offers checkout and card update', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.configure({ monthly_instalments_enabled: true });
    const t = await s.tier();
    const j = await s.holder(t);
    const email = (await h.one(pool, 'SELECT email FROM org_constituents WHERE id = $1', [j.constituent_id])).email;
    const link = await require('../../server/organizational/lib/publicLinks').createLink(pool, { orgId: s.org.id, purpose: 'membership_session', constituentId: j.constituent_id, minutes: 60 });
    const pc = (method, path, body) => s.pub.call(method, P + path, { params: { slug: s.org.slug }, headers: { 'x-link-token': link.token }, body: body || {}, ip: '10.1.1.' + (++n % 200) });
    const me = await pc('GET', '/me');
    assert.equal(me.body.card_payments, true);
    assert.equal(me.body.monthly_offered, true);
    const once = await pc('POST', '/me/checkout', { plan: 'once' });
    assert.equal(once.statusCode, 200, JSON.stringify(once.body));
    assert.match(once.body.url, /^https:\/\/checkout\.example\.test\//);
    const monthly = await pc('POST', '/me/checkout', { plan: 'monthly' });
    assert.equal(monthly.statusCode, 200);
    const calls = fake.calls.filter((c) => c.fn === 'createCheckout');
    assert.deepEqual(calls.map((c) => [c.kind, c.amountCents, c.interval || null, c.metadata.term_id, c.customerEmail]),
      [['payment', 12000, null, String(j.term_id), email], ['subscription', 1000, 'month', String(j.term_id), email]]);
    await s.send({ kind: 'subscription_started', orgId: s.org.id, termId: j.term_id, subscriptionRef: 'sub_m', customerRef: 'cus_m', plan: 'monthly' });
    await s.send({ kind: 'payment_succeeded', orgId: s.org.id, termId: j.term_id, amountCents: 1000, paymentRef: 'in_m1', subscriptionRef: 'sub_m', billingReason: 'subscription_create' });
    assert.equal((await s.record(j.constituent_id)).status, 'active');
    const card = await pc('POST', '/me/card');
    assert.equal(card.statusCode, 200);
    assert.equal(card.body.url, 'https://portal.example.test/cus_m');
    await s.scall('PUT', '/settings', 'admin', { body: { monthly_instalments_enabled: false } }, 200);
    assert.equal((await pc('POST', '/me/checkout', { plan: 'monthly' })).statusCode, 400);
  });
});

test("refunds: a card payment is refunded through the provider once; the provider's refund event adds nothing more", opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.configure();
    const t = await s.tier();
    const j = await s.holder(t);
    await s.send({ kind: 'payment_succeeded', orgId: s.org.id, termId: j.term_id, amountCents: 12000, paymentRef: 'pi_r', customerRef: 'cus_r' });
    const pay = (await s.record(j.constituent_id)).payments[0];
    const r = await s.scall('POST', '/payments/:id/refund', 'finance', { params: { id: String(pay.id) }, body: { amount: '20', reason: 'Charged too much' } }, 201);
    assert.deepEqual(fake.calls.filter((c) => c.fn === 'refund').map((c) => [c.paymentRef, c.amountCents]), [['pi_r', 2000]]);
    const refund = await h.one(pool, 'SELECT processor_ref, method FROM org_membership_payments WHERE id = $1', [r.body.payment_id]);
    assert.equal(refund.method, 'card');
    await s.send({ kind: 'refunded', orgId: s.org.id, paymentRef: 'pi_r', refunds: [{ id: refund.processor_ref, amountCents: 2000 }] });
    await s.send({ kind: 'refunded', orgId: s.org.id, paymentRef: 'pi_r', refunds: [{ id: refund.processor_ref, amountCents: 2000 }, { id: 're_dashboard', amountCents: 500 }] });
    const rows = (await s.record(j.constituent_id)).payments.filter((p) => p.kind === 'refund');
    assert.deepEqual(rows.map((p) => p.amount_cents).sort((a, b) => a - b), [500, 2000]);
  });
});

test('organizations pay by invoice: the draft uses the tier accounts, the existing invoice route creates it, and its payments settle the term', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp);
    await asOwner();
    const acct = await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, '4100', 'Membership dues', 'income', true, 3) RETURNING id`, [s.org.id]);
    const bank = await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account) VALUES ($1, '1000', 'Bank', 'asset', true, 3, true) RETURNING id`, [s.org.id]);
    const prog = await h.one(pool, `INSERT INTO org_programs (org_id, name) VALUES ($1, 'Membership program') RETURNING id`, [s.org.id]);
    await asApp(s.org.id);
    const t = await s.tier({ applies_to: 'organization', revenue_account_id: acct.id, program_id: prog.id });
    const j = await s.holder(t, { contact: { kind: 'organization', display_name: 'Dues-paying business', email: 'biz@example.test' } });
    const draft = await s.scall('POST', '/terms/:id/invoice-draft', 'finance', { params: { id: String(j.term_id) } }, 200);
    assert.deepEqual(draft.body.lines.map((l) => [l.account_id, l.program_id, l.unit_amount_cents]), [[acct.id, prog.id, 12000]]);
    const roles = await pool.query(`SELECT role FROM org_contact_roles WHERE constituent_id = $1 ORDER BY role`, [j.constituent_id]);
    assert.deepEqual(roles.rows.map((x) => x.role), ['customer', 'dues_member']);
    const inv = h.loadRoutes('routes/invoices.js', 'registerInvoicesRoutes', pool);
    const created = await inv.call('POST', '/api/organizational/orgs/:slug/invoices', s.as('finance', { body: draft.body }));
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    await s.scall('POST', '/terms/:id/invoice', 'finance', { params: { id: String(j.term_id) }, body: { invoice_id: created.body.id } }, 200);
    assert.equal((await s.scall('POST', '/terms/:id/invoice-draft', 'finance', { params: { id: String(j.term_id) } })).statusCode, 409);
    assert.equal((await s.record(j.constituent_id)).status, 'pending');
    await asOwner();
    await pool.query(`INSERT INTO org_invoice_payments (org_id, invoice_id, bank_account_id, payment_date, amount_cents, fiscal_year) VALUES ($1, $2, $3, CURRENT_DATE, 12000, 2026)`, [s.org.id, created.body.id, bank.id]);
    await asApp(s.org.id);
    const rec = await s.record(j.constituent_id);
    assert.equal(rec.status, 'active');
    assert.equal(rec.payments.length, 0);
  });
});
