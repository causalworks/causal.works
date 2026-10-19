'use strict';

// Public Membership pages against a throwaway database: the join form and its confirmation link, staff approval,
// the extra gift, the dues member sign-in link and account page, and the abuse guards (honeypot, timing, rate limit,
// single-use links, no data from another contact or workspace).

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');
const mailer = require('../../server/organizational/lib/sendPlainEmail');
const { issueFormToken } = require('../../server/organizational/lib/publicLinks');
const S = require('../../server/organizational/lib/membershipStatus');
const M = require('../../server/organizational/lib/membership');

const opts = { skip: h.SKIP };
const P = '/api/public/:slug/membership';
const B = '/api/organizational/orgs/:slug/membership';
let ipCounter = 0;

async function setup(pool, asApp, settings) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Tenants Union', 'pub-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled, reply_to_email) VALUES ($1, 12, true, $2)', [org.id, 'office@example.test']);
  const users = {};
  for (const role of ['admin', 'finance']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  await asApp(org.id);
  const sent = [];
  mailer.sendPlainEmail = async (m) => { sent.push(m); return true; };
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const pub = h.loadRoutes('public/membership.js', 'registerPublicMembershipRoutes', pool);
  const asStaff = (role, extra) => ({ user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
  const tier = async (body) => (await staff.call('POST', B + '/tiers', asStaff('finance', { body: { name: 'Standard', price: '40', ...body } }))).body.tier;
  await staff.call('PUT', B + '/settings', asStaff('admin', { body: { join_form_enabled: true, form_fields: ['phone', 'mailing_address', 'annual_budget'], extra_gift_enabled: true, ...(settings || {}) } }));
  const ip = () => '10.0.0.' + (++ipCounter % 250);
  const pcall = (method, path, extra) => pub.call(method, P + path, { params: { slug: org.slug }, ip: ip(), ...(extra || {}) });
  const form = () => ({ form_token: issueFormToken(org.id, Date.now() - 5000) });
  const tokenFrom = (m) => (m.text.match(/#t=([A-Za-z0-9_-]+)/) || [])[1];
  const join = async (body) => {
    const res = await pcall('POST', '/join', { body: { ...form(), ...body } });
    assert.equal(res.statusCode, 202, JSON.stringify(res.body));
    return tokenFrom(sent[sent.length - 1]);
  };
  return { org, users, staff, pub, asStaff, tier, pcall, form, sent, tokenFrom, join };
}

test('the join form is only there when turned on, and shows tiers but no contact data', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp, { join_form_enabled: false });
    await s.tier();
    assert.equal((await s.pcall('GET', '/join')).statusCode, 404);
    await s.staff.call('PUT', B + '/settings', s.asStaff('admin', { body: { join_form_enabled: true } }));
    await pool.query(`INSERT INTO org_constituents (org_id, display_name, email, kind) VALUES ($1, 'Somebody private', 'private@example.test', 'individual')`, [s.org.id]);
    const res = await s.pcall('GET', '/join');
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.tiers.map((t) => [t.name, t.price_cents]), [['Standard', 4000]]);
    assert.ok(res.body.form_token);
    assert.doesNotMatch(JSON.stringify(res.body), /private@example|Somebody private/);
    assert.equal((await s.pub.call('GET', P + '/join', { params: { slug: 'no-such-workspace' } })).statusCode, 404);
  });
});

test('joining: honeypot and too-fast submits are refused; a valid one waits for the email link, which works once', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const t = await s.tier();
    const body = { kind: 'individual', first_name: 'Dues', last_name: 'Applicant', email: 'applicant@example.test', phone: '555-0100', tier_id: t.id };
    const honey = await s.pcall('POST', '/join', { body: { ...s.form(), ...body, website: 'http://spam.example' } });
    assert.equal(honey.statusCode, 400);
    const fast = await s.pcall('POST', '/join', { body: { ...body, form_token: issueFormToken(s.org.id, Date.now()) } });
    assert.equal(fast.body.code, 'too_fast');
    const noToken = await s.pcall('POST', '/join', { body });
    assert.equal(noToken.statusCode, 400);
    assert.equal(s.sent.length, 0);

    const token = await s.join(body);
    assert.equal(s.sent[0].to, 'applicant@example.test');
    assert.equal(s.sent[0].replyTo, 'office@example.test');
    assert.match(s.sent[0].subject, /^Tenants Union: /);
    const contacts = await pool.query(`SELECT count(*)::int AS n FROM org_constituents WHERE org_id = $1`, [s.org.id]);
    assert.equal(contacts.rows[0].n, 0);
    const stored = await pool.query(`SELECT count(*)::int AS n FROM org_public_links WHERE token_hash = $1`, [token]);
    assert.equal(stored.rows[0].n, 0);

    const ok = await s.pcall('POST', '/join/confirm', { headers: { 'x-link-token': token } });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.status, 'joined');
    assert.equal(ok.body.price_cents, 4000);
    assert.match(ok.body.payment_note, /check|invoice/);
    const again = await s.pcall('POST', '/join/confirm', { headers: { 'x-link-token': token } });
    assert.equal(again.statusCode, 401);
    assert.equal(again.body.code, 'link_used');

    const c = await h.one(pool, `SELECT c.id, c.display_name, c.phone FROM org_constituents c WHERE c.org_id = $1`, [s.org.id]);
    assert.deepEqual([c.display_name, c.phone], ['Dues Applicant', '555-0100']);
    const list = (await s.staff.call('GET', B + '/dues-members', s.asStaff('finance'))).body.dues_members;
    assert.deepEqual(list.map((x) => [x.display_name, x.status]), [['Dues Applicant', 'pending']]);
    const rq = await h.one(pool, `SELECT status, details FROM org_membership_join_requests WHERE org_id = $1`, [s.org.id]);
    assert.deepEqual([rq.status, rq.details], ['accepted', {}]);
    const uses = await pool.query(`SELECT action FROM org_public_link_uses WHERE org_id = $1`, [s.org.id]);
    assert.deepEqual(uses.rows.map((u) => u.action), ['join_confirmed']);
  });
});

test('a confirmed email that matches a contact joins that contact; a current dues member is told to sign in', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const t = await s.tier({ price: '0', name: 'Free' });
    const existing = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, email, phone, kind) VALUES ($1, 'Known donor', 'Known@Example.test', '555-0001', 'individual') RETURNING id`, [s.org.id]);
    const token = await s.join({ first_name: 'Typed', last_name: 'Name', email: 'known@example.test', phone: '555-9999', tier_id: t.id });
    const ok = await s.pcall('POST', '/join/confirm', { headers: { 'x-link-token': token } });
    assert.equal(ok.body.status, 'joined');
    const c = await h.one(pool, `SELECT display_name, phone FROM org_constituents WHERE id = $1`, [existing.id]);
    assert.deepEqual([c.display_name, c.phone], ['Known donor', '555-0001']);
    const n = await h.one(pool, `SELECT count(*)::int AS n FROM org_constituents WHERE org_id = $1`, [s.org.id]);
    assert.equal(n.n, 1);
    const list = (await s.staff.call('GET', B + '/dues-members', s.asStaff('finance'))).body.dues_members;
    assert.deepEqual(list.map((x) => x.status), ['active']);

    const token2 = await s.join({ first_name: 'Typed', last_name: 'Name', email: 'known@example.test', tier_id: t.id });
    const dup = await s.pcall('POST', '/join/confirm', { headers: { 'x-link-token': token2 } });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.body.code, 'already_member');
  });
});

test('staff approval, pay what you can, the eligibility tick and the extra gift as a gift to confirm in Funding', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp, { join_requires_approval: true });
    const t = await s.tier({ name: 'Choose', price: '0', pay_what_you_can: true, min_price: '10', eligibility_required: true, eligibility_statement: 'I rent my home.' });
    const low = await s.pcall('POST', '/join', { body: { ...s.form(), first_name: 'Low', email: 'low@example.test', tier_id: t.id, price: '5', eligibility_confirmed: true } });
    assert.equal(low.statusCode, 400);
    const noTick = await s.pcall('POST', '/join', { body: { ...s.form(), first_name: 'No', email: 'no@example.test', tier_id: t.id, price: '15' } });
    assert.equal(noTick.statusCode, 400);
    const token = await s.join({ kind: 'organization', organization_name: 'Building association', email: 'assoc@example.test', annual_budget: '25000', tier_id: t.id, price: '25', eligibility_confirmed: true, extra_gift: '50' });
    const conf = await s.pcall('POST', '/join/confirm', { headers: { 'x-link-token': token } });
    assert.equal(conf.body.status, 'awaiting_approval');
    const queue = (await s.staff.call('GET', B + '/join-requests', s.asStaff('finance'))).body.join_requests;
    assert.deepEqual(queue.map((q) => [q.display_name, q.kind, q.price_cents, q.extra_gift_cents, q.annual_budget_cents]), [['Building association', 'organization', 2500, 5000, 2500000]]);
    const noReason = await s.staff.call('POST', B + '/join-requests/:id/decline', s.asStaff('finance', { params: { id: String(queue[0].id) } }));
    assert.equal(noReason.statusCode, 400);
    const ok = await s.staff.call('POST', B + '/join-requests/:id/approve', s.asStaff('finance', { params: { id: String(queue[0].id) } }));
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    const term = await h.one(pool, `SELECT price_cents, source FROM org_membership_terms WHERE id = $1`, [ok.body.term_id]);
    assert.deepEqual([term.price_cents, term.source], [2500, 'join_form']);
    const gift = await h.one(pool, `SELECT amount_cents, review_status, posting_status, constituent_id FROM org_gifts WHERE id = $1`, [ok.body.gift_id]);
    assert.deepEqual([Number(gift.amount_cents), gift.review_status, gift.posting_status, gift.constituent_id], [5000, 'to_confirm', 'not_applicable', ok.body.constituent_id]);
    const again = await s.staff.call('POST', B + '/join-requests/:id/approve', s.asStaff('finance', { params: { id: String(queue[0].id) } }));
    assert.equal(again.statusCode, 409);
  });
});

test('sign-in: same answer for any email; the link works once; the account page shows only that dues member', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp);
    const t = await s.tier({ price: '0', name: 'Free' });
    for (const [name, email] of [['First holder', 'first@example.test'], ['Second holder', 'second@example.test']]) {
      await s.staff.call('POST', B + '/dues-members', s.asStaff('finance', { body: { tier_id: t.id, starts_on: S.addDays(M.today(), -330), contact: { display_name: name, email } } }));
    }
    await pool.query(`INSERT INTO org_constituents (org_id, display_name, email, kind) VALUES ($1, 'Only a donor', 'donor@example.test', 'individual')`, [s.org.id]);
    const unknown = await s.pcall('POST', '/sign-in', { body: { ...s.form(), email: 'nobody@example.test' } });
    const donor = await s.pcall('POST', '/sign-in', { body: { ...s.form(), email: 'donor@example.test' } });
    const known = await s.pcall('POST', '/sign-in', { body: { ...s.form(), email: 'FIRST@example.test' } });
    assert.deepEqual([unknown.statusCode, donor.statusCode, known.statusCode], [200, 200, 200]);
    assert.equal(unknown.body.message, known.body.message);
    assert.equal(s.sent.length, 1);
    const signIn = s.tokenFrom(s.sent[0]);
    const link = await h.one(pool, `SELECT single_use, expires_at - created_at AS life FROM org_public_links WHERE purpose = 'membership_sign_in' AND org_id = $1`, [s.org.id]);
    assert.equal(link.single_use, true);
    assert.equal(link.life.minutes, 30);

    const sess = await s.pcall('POST', '/session', { headers: { 'x-link-token': signIn } });
    assert.equal(sess.statusCode, 200);
    assert.equal((await s.pcall('POST', '/session', { headers: { 'x-link-token': signIn } })).statusCode, 401);
    assert.equal((await s.pcall('GET', '/me', { headers: { 'x-link-token': signIn } })).statusCode, 401);

    const me = await s.pcall('GET', '/me', { headers: { 'x-link-token': sess.body.session } });
    assert.equal(me.statusCode, 200);
    assert.equal(me.body.contact.display_name, 'First holder');
    assert.equal(me.body.status, 'active');
    const text = JSON.stringify(me.body);
    assert.doesNotMatch(text, /Second holder|second@example|donor@example/);
    assert.ok(!('id' in me.body.contact));

    const upd = await s.pcall('POST', '/me/details', { headers: { 'x-link-token': sess.body.session }, body: { ...s.form(), phone: '555-1234', email: 'changed@example.test' } });
    assert.equal(upd.statusCode, 200);
    const c = await h.one(pool, `SELECT phone, email FROM org_constituents WHERE org_id = $1 AND display_name = 'First holder'`, [s.org.id]);
    assert.deepEqual([c.phone, c.email], ['555-1234', 'first@example.test']);
    const logged = await h.one(pool, `SELECT count(*)::int AS n FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_constituents' AND field_name = 'phone'`, [s.org.id]);
    assert.equal(logged.n, 1);

    const renew = await s.pcall('POST', '/me/renew', { headers: { 'x-link-token': sess.body.session }, body: { ...s.form() } });
    assert.equal(renew.statusCode, 201, JSON.stringify(renew.body));
    assert.equal(renew.body.starts_on, S.addDays(S.addDays(S.addMonths(S.addDays(M.today(), -330), 12), -1), 1));
    const twice = await s.pcall('POST', '/me/renew', { headers: { 'x-link-token': sess.body.session }, body: { ...s.form() } });
    assert.equal(twice.statusCode, 409);

    await asOwner();
    const other = await setup(pool, asApp);
    await other.tier();
    const cross = await other.pcall('GET', '/me', { headers: { 'x-link-token': sess.body.session } });
    assert.equal(cross.statusCode, 401);
  });
});

test('renewal from the account page waits for the renewal window', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const t = await s.tier({ price: '0', name: 'Free' });
    await s.staff.call('POST', B + '/dues-members', s.asStaff('finance', { body: { tier_id: t.id, contact: { display_name: 'New holder', email: 'new@example.test' } } }));
    await s.pcall('POST', '/sign-in', { body: { ...s.form(), email: 'new@example.test' } });
    const sess = await s.pcall('POST', '/session', { headers: { 'x-link-token': s.tokenFrom(s.sent[0]) } });
    const me = await s.pcall('GET', '/me', { headers: { 'x-link-token': sess.body.session } });
    assert.equal(me.body.renewal_open, false);
    const early = await s.pcall('POST', '/me/renew', { headers: { 'x-link-token': sess.body.session }, body: { ...s.form() } });
    assert.equal(early.statusCode, 400);
    assert.match(early.body.error, /Renewal opens on/);
  });
});

test('public membership routes are rate limited by IP', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const codes = [];
    for (let i = 0; i < 8; i++) {
      const r = await s.pub.call('POST', P + '/sign-in', { params: { slug: s.org.slug }, ip: '10.9.9.9', body: { ...s.form(), email: 'x' + i + '@example.test' } });
      codes.push(r.statusCode);
    }
    assert.deepEqual(codes.slice(0, 5), [200, 200, 200, 200, 200]);
    assert.equal(codes[7], 429);
  });
});
