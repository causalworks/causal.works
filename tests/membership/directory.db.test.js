'use strict';

// Directory, benefits, gated documents and seats against a throwaway database.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.CAUSAL_UPLOADS_ROOT = process.env.CAUSAL_UPLOADS_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'memb-test-'));

const h = require('../sponsorship/helpers');
const mailer = require('../../server/organizational/lib/sendPlainEmail');
const { issueFormToken, createLink } = require('../../server/organizational/lib/publicLinks');
const S = require('../../server/organizational/lib/membershipStatus');
const M = require('../../server/organizational/lib/membership');

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';
const P = '/api/public/:slug/membership';
const TODAY = M.today();
let n = 0;

async function setup(pool, asApp, asOwner) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Makers Guild', 'dir-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const users = {};
  for (const role of ['admin', 'fundraising']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  await asApp(org.id);
  const sent = [];
  mailer.sendPlainEmail = async (m) => { sent.push(m); return true; };
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const pub = h.loadRoutes('public/membership.js', 'registerPublicMembershipRoutes', pool);
  const call = async (method, p, role, extra, expect) => {
    const res = await staff.call(method, B + p, { user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + p + ' ' + JSON.stringify(res.body));
    return res;
  };
  const pc = async (method, p, token, body) => {
    const res = await pub.call(method, P + p, { params: { slug: org.slug }, headers: token ? { 'x-link-token': token } : {}, body: body || {}, ip: '10.6.6.' + (++n % 200) });
    if (p === '/sign-in') await new Promise((r) => setTimeout(r, 200));
    return res;
  };
  const session = async (contactId) => (await createLink(pool, { orgId: org.id, purpose: 'membership_session', constituentId: contactId, minutes: 60 })).token;
  const form = () => ({ form_token: issueFormToken(org.id, Date.now() - 5000) });
  return { org, users, call, pc, session, form, sent, staff, pub };
}

test('seats: an organization term holds up to its seats; a seat holder signs in and gets the benefits while it is active', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const orgTier = (await s.call('POST', '/tiers', 'admin', { body: { name: 'Organization', price: '0', applies_to: 'organization', seats_included: 2, benefits: ['Workshop discount', 'Newsletter'] } }, 201)).body.tier;
    const indTier = (await s.call('POST', '/tiers', 'admin', { body: { name: 'Person', price: '0' } }, 201)).body.tier;
    const firm = (await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: orgTier.id, contact: { kind: 'organization', display_name: 'Woodshop cooperative' } } }, 201)).body;
    const solo = (await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: indTier.id, contact: { display_name: 'Solo holder' } } }, 201)).body;
    assert.equal((await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(solo.term_id) }, body: { contact: { display_name: 'X' } } })).statusCode, 400);
    const a = await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { contact: { display_name: 'Seat one', email: 'seat1@example.test' }, label: 'Lead' } }, 201);
    assert.equal((await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { constituent_id: a.body.constituent_id } })).statusCode, 409);
    assert.equal((await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { constituent_id: firm.constituent_id } })).statusCode, 400);
    const b = await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { contact: { display_name: 'Seat two' } } }, 201);
    const full = await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { contact: { display_name: 'Seat three' } } });
    assert.equal(full.statusCode, 409);
    assert.match(full.body.error, /All 2 seats/);
    await s.call('POST', '/seats/:id/end', 'fundraising', { params: { id: String(b.body.seat_id) }, body: { ends_on: TODAY } }, 200);
    await s.call('POST', '/terms/:id/seats', 'fundraising', { params: { id: String(firm.term_id) }, body: { contact: { display_name: 'Seat three' } } }, 201);
    const rec = await s.call('GET', '/dues-members/:id', 'fundraising', { params: { id: String(firm.constituent_id) } }, 200);
    assert.equal(rec.body.seats.length, 3);

    const signIn = await s.pc('POST', '/sign-in', null, { ...s.form(), email: 'seat1@example.test' });
    assert.equal(signIn.statusCode, 200);
    assert.equal(s.sent.length, 1);
    const tok = s.sent[0].text.match(/#t=([A-Za-z0-9_-]+)/)[1];
    const sess = await s.pc('POST', '/session', tok);
    const me = await s.pc('GET', '/me', sess.body.session);
    assert.equal(me.statusCode, 200);
    assert.equal(me.body.seat.holder_name, 'Woodshop cooperative');
    assert.deepEqual(me.body.benefits, ['Workshop discount', 'Newsletter']);
    await s.call('POST', '/terms/:id/end', 'fundraising', { params: { id: String(firm.term_id) }, body: { reason: 'Closed' } }, 200);
    const after = await s.pc('GET', '/me', sess.body.session);
    assert.equal(after.body.seat, null);
  });
});

test('gated documents: listed and downloadable only while the membership is active; staff still see them', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const tier = (await s.call('POST', '/tiers', 'admin', { body: { name: 'Standard', price: '50' } }, 201)).body.tier;
    const paid = (await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: tier.id, contact: { display_name: 'Paid holder' } } }, 201)).body;
    await s.call('POST', '/terms/:id/payments', 'admin', { params: { id: String(paid.term_id) }, body: { amount: '50' } }, 201);
    const unpaid = (await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: tier.id, contact: { display_name: 'Unpaid holder' } } }, 201)).body;
    const rel = 'membership-test/' + s.org.id + '-guide.txt';
    fs.mkdirSync(path.join(process.env.CAUSAL_UPLOADS_ROOT, 'membership-test'), { recursive: true });
    fs.writeFileSync(path.join(process.env.CAUSAL_UPLOADS_ROOT, rel), 'guide');
    const doc = await h.one(pool,
      `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, visibility)
       VALUES ($1, 'other', 'Dues member guide', 'guide.txt', $2, 'text/plain', 5, md5(random()::text), 'dues_members') RETURNING id`, [s.org.id, rel]);
    await pool.query(`INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, visibility)
       VALUES ($1, 'other', 'Board minutes', 'm.txt', 'x/m.txt', 'text/plain', 1, md5(random()::text), 'org_all')`, [s.org.id]);
    const good = await s.session(paid.constituent_id);
    const me = await s.pc('GET', '/me', good);
    assert.deepEqual(me.body.documents.map((d) => d.title), ['Dues member guide']);
    const dl = await s.pc('GET', '/me/documents/:id', good);
    assert.equal(dl.statusCode, 404);
    const ok = await s.pub.call('GET', P + '/me/documents/:id', { params: { slug: s.org.slug, id: String(doc.id) }, headers: { 'x-link-token': good }, ip: '10.7.7.7' });
    assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
    assert.equal(ok.body, path.join(process.env.CAUSAL_UPLOADS_ROOT, rel));
    const bad = await s.session(unpaid.constituent_id);
    assert.deepEqual((await s.pc('GET', '/me', bad)).body.documents, []);
    const refused = await s.pub.call('GET', P + '/me/documents/:id', { params: { slug: s.org.slug, id: String(doc.id) }, headers: { 'x-link-token': bad }, ip: '10.7.7.8' });
    assert.equal(refused.statusCode, 403);
    const docs = h.loadRoutes('routes/documents.js', 'registerOrganizationalDocumentRoutes', pool);
    const list = await docs.call('GET', '/api/organizational/orgs/:slug/documents', { user: s.users.fundraising, role: 'fundraising', orgId: s.org.id, params: { slug: s.org.slug } });
    const titles = JSON.stringify(list.body);
    assert.match(titles, /Dues member guide/);
  });
});

test('directory: off until turned on; only opted-in active dues members; only allowed, chosen fields; public and private', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const tier = (await s.call('POST', '/tiers', 'admin', { body: { name: 'Free', price: '0' } }, 201)).body.tier;
    const add = async (name, email, startsOn) => (await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: tier.id, starts_on: startsOn, contact: { display_name: name, email } } }, 201)).body;
    const a = await add('Public person', 'pub@example.test');
    const b = await add('Private person', 'priv@example.test');
    const c = await add('Lapsed person', 'lapsed@example.test', S.addDays(TODAY, -500));
    await pool.query(`UPDATE org_constituents SET phone = '555-0199' WHERE id = $1`, [a.constituent_id]);
    assert.equal((await s.pc('GET', '/directory')).statusCode, 404);
    await s.call('PUT', '/settings', 'admin', { body: { directory_enabled: true, directory_fields: ['tier', 'email'] } }, 200);
    assert.equal((await s.call('PUT', '/settings', 'admin', { body: { directory_fields: ['shoe_size'] } })).statusCode, 400);
    const sa = await s.session(a.constituent_id);
    const sb = await s.session(b.constituent_id);
    const sc = await s.session(c.constituent_id);
    assert.equal((await s.pc('POST', '/me/directory', sa, { listed: true, fields: ['email', 'phone', 'tier'], visibility: 'public' })).statusCode, 400);
    const saved = await s.pc('POST', '/me/directory', sa, { ...s.form(), listed: true, fields: ['email', 'phone', 'tier'], visibility: 'public' });
    assert.deepEqual(saved.body.directory, { listed: true, fields: ['name', 'email', 'tier'], visibility: 'public' });
    await s.pc('POST', '/me/directory', sb, { ...s.form(), listed: true, fields: ['tier'], visibility: 'private' });
    await s.pc('POST', '/me/directory', sc, { ...s.form(), listed: true, fields: ['email'], visibility: 'public' });
    const pub = await s.pc('GET', '/directory');
    assert.deepEqual(pub.body.entries, [{ name: 'Public person', tier: 'Free', email: 'pub@example.test' }]);
    assert.doesNotMatch(JSON.stringify(pub.body), /555-0199|priv@|lapsed|"id"/);
    const priv = await s.pc('GET', '/me/directory', sb);
    assert.deepEqual(priv.body.entries, [{ name: 'Private person', tier: 'Free' }, { name: 'Public person', tier: 'Free', email: 'pub@example.test' }]);
    assert.equal((await s.pc('GET', '/me/directory', sc)).statusCode, 403);
    await s.pc('POST', '/me/directory', sa, { ...s.form(), listed: false });
    assert.deepEqual((await s.pc('GET', '/directory')).body.entries, []);
    const log = await pool.query(`SELECT count(*)::int AS n FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_membership_directory_optin'`, [s.org.id]);
    assert.equal(log.rows[0].n, 4);
  });
});
