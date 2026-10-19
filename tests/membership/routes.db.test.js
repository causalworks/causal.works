'use strict';

// Membership staff routes against a throwaway database: joining, payments, waivers, refunds, extensions,
// ending, dated prices, pay-what-you-can, renewals, the summary, settings, access by role and row-level security.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');
const S = require('../../server/organizational/lib/membershipStatus');
const M = require('../../server/organizational/lib/membership');

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';
const TODAY = M.today();

async function seed(pool) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Membership workspace', 'memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const users = {};
  for (const role of ['admin', 'finance', 'fundraising', 'board', 'program', 'staff']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  return { orgId: org.id, slug: org.slug, users };
}

async function setup(pool, asApp) {
  const ws = await seed(pool);
  await asApp(ws.orgId);
  const r = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const as = (role, extra) => ({ user: ws.users[role] || ws.users.admin, role: role === 'manager' || role === 'reader' ? 'board' : role, orgId: ws.orgId, ...(extra || {}),
    params: { slug: ws.slug, ...((extra && extra.params) || {}) } });
  const call = async (method, path, role, extra, expect) => {
    const res = await r.call(method, B + path, as(role, extra));
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + path + ' ' + JSON.stringify(res.body));
    return res;
  };
  const tier = async (body) => (await call('POST', '/tiers', 'finance', { body: { name: 'Standard', price: '100', ...body } }, 201)).body.tier;
  const join = async (body, role) => (await call('POST', '/dues-members', role || 'fundraising', { body }, 201)).body;
  const record = async (id) => (await call('GET', '/dues-members/:id', 'finance', { params: { id: String(id) } }, 200)).body;
  return { ws, r, as, call, tier, join, record };
}

test('joining creates a contact with the dues member role and a pending term; a payment makes it active', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    const t = await tier();
    assert.equal(t.price_cents, 10000);
    const j = await join({ tier_id: t.id, contact: { first_name: 'Dues', last_name: 'Holder one', email: 'holder1@example.test' } });
    let rec = await record(j.constituent_id);
    assert.equal(rec.status, 'pending');
    assert.equal(rec.terms[0].starts_on, TODAY);
    assert.equal(rec.terms[0].ends_on, S.addDays(S.addMonths(TODAY, 12), -1));
    const role = await pool.query(`SELECT role FROM org_contact_roles WHERE constituent_id = $1`, [j.constituent_id]);
    assert.deepEqual(role.rows.map((x) => x.role), ['dues_member']);

    await call('POST', '/terms/:id/payments', 'finance', { params: { id: String(j.term_id) }, body: { amount: '100', method: 'check' } }, 201);
    rec = await record(j.constituent_id);
    assert.equal(rec.status, 'active');
    assert.equal(rec.payments[0].posting_status, 'unposted');

    const dup = await call('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, contact: { display_name: 'Someone', email: 'HOLDER1@example.test' } } });
    assert.equal(dup.statusCode, 409);
    assert.equal(dup.body.constituent_id, j.constituent_id);
    const again = await call('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, constituent_id: j.constituent_id } });
    assert.equal(again.statusCode, 409);

    const audit = await pool.query(`SELECT table_name, action FROM org_audit_log WHERE org_id = (SELECT org_id FROM org_membership_terms WHERE id = $1) ORDER BY id`, [j.term_id]);
    assert.deepEqual(audit.rows.map((a) => a.table_name + ':' + a.action), ['org_membership_tiers:create', 'org_constituents:create', 'org_membership_terms:create', 'org_membership_payments:create']);
  });
});

test('the list shows only dues members, filters by status and tier, and the summary counts by status', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, call, tier, join } = await setup(pool, asApp);
    const a = await tier({ name: 'Standard' });
    const free = await tier({ name: 'Free', price: '0' });
    await pool.query(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Plain donor', 'individual')`, [ws.orgId]);
    const j1 = await join({ tier_id: a.id, contact: { display_name: 'Unpaid holder' } });
    const j2 = await join({ tier_id: free.id, contact: { display_name: 'Free holder' } });
    const list = (await call('GET', '/dues-members', 'fundraising', {}, 200)).body.dues_members;
    assert.deepEqual(list.map((x) => x.display_name), ['Free holder', 'Unpaid holder']);
    const active = (await call('GET', '/dues-members', 'fundraising', { query: { status: 'active' } }, 200)).body.dues_members;
    assert.deepEqual(active.map((x) => x.id), [j2.constituent_id]);
    const byTier = (await call('GET', '/dues-members', 'fundraising', { query: { tier_id: String(a.id) } }, 200)).body.dues_members;
    assert.deepEqual(byTier.map((x) => x.id), [j1.constituent_id]);
    const sum = (await call('GET', '/summary', 'board', {}, 200)).body;
    assert.equal(sum.counts.active, 1);
    assert.equal(sum.counts.pending, 1);
    assert.deepEqual(sum.active_by_tier, { Free: 1 });
  });
});

test('pay-what-you-can keeps the lowest price; set prices cannot be changed; eligibility and applies-to are checked', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const pwyc = await s.tier({ name: 'Choose', price: '0', pay_what_you_can: true, min_price: '20', suggested_price: '50', benefit_value: '30' });
    const low = await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: pwyc.id, price: '10', contact: { display_name: 'Low payer' } } });
    assert.equal(low.statusCode, 400);
    assert.match(low.body.error, /lowest amount/);
    const ok = await s.join({ tier_id: pwyc.id, price: '80', contact: { display_name: 'Generous payer' } });
    const rec = await s.record(ok.constituent_id);
    assert.equal(rec.terms[0].price_cents, 8000);
    assert.equal(rec.terms[0].contribution_cents, 5000);

    const fixed = await s.tier({ name: 'Set price' });
    const changed = await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: fixed.id, price: '50', contact: { display_name: 'Haggler' } } });
    assert.equal(changed.statusCode, 400);
    assert.match(changed.body.error, /discount/);

    const elig = await s.tier({ name: 'Eligible only', eligibility_required: true, eligibility_statement: 'I work in this field.' });
    const noTick = await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: elig.id, contact: { display_name: 'No tick' } } });
    assert.equal(noTick.statusCode, 400);
    await s.join({ tier_id: elig.id, eligibility_confirmed: true, contact: { display_name: 'Ticked' } });

    const orgTier = await s.tier({ name: 'Organizations', applies_to: 'organization' });
    const wrong = await s.call('POST', '/dues-members', 'fundraising', { body: { tier_id: orgTier.id, contact: { kind: 'individual', display_name: 'A person' } } });
    assert.equal(wrong.statusCode, 400);
    await s.join({ tier_id: orgTier.id, contact: { kind: 'organization', display_name: 'An organization' } });

    const badTier = await s.call('POST', '/tiers', 'finance', { body: { name: 'Bad', price: '1', budget_low: '100', budget_high: '50' } });
    assert.equal(badTier.statusCode, 400);
  });
});

test('a dated price change applies to new terms; existing terms keep the price they were sold at', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    const t = await tier({ price: '100' });
    const first = await join({ tier_id: t.id, contact: { display_name: 'Early joiner' } });
    const from = S.addDays(TODAY, 10);
    await call('POST', '/tiers/:id/prices', 'admin', { params: { id: String(t.id) }, body: { price: '150', effective_on: from } }, 201);
    assert.equal((await record(first.constituent_id)).terms[0].price_cents, 10000);
    const later = await join({ tier_id: t.id, starts_on: from, contact: { display_name: 'Later joiner' } });
    assert.equal((await record(later.constituent_id)).terms[0].price_cents, 15000);
    const now = await join({ tier_id: t.id, contact: { display_name: 'Joiner today' } });
    assert.equal((await record(now.constituent_id)).terms[0].price_cents, 10000);
    await call('POST', '/tiers/:id/archive', 'finance', { params: { id: String(t.id) } }, 200);
    const archived = await call('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, contact: { display_name: 'Too late' } } });
    assert.equal(archived.statusCode, 400);
    assert.match(archived.body.error, /archived/);
  });
});

test('a waiver needs a reason and an approver other than the person who entered it', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    const t = await tier();
    const j = await join({ tier_id: t.id, contact: { display_name: 'Hardship case' } });
    const noReason = await call('POST', '/terms/:id/waivers', 'fundraising', { params: { id: String(j.term_id) }, body: { amount: '100' } });
    assert.equal(noReason.statusCode, 400);
    const w = await call('POST', '/terms/:id/waivers', 'fundraising', { params: { id: String(j.term_id) }, body: { amount: '100', reason: 'Hardship' } }, 201);
    assert.equal((await record(j.constituent_id)).status, 'pending');
    const own = await call('POST', '/payments/:id/approve', 'fundraising', { params: { id: String(w.body.payment_id) } });
    assert.equal(own.statusCode, 403);
    await call('POST', '/payments/:id/approve', 'finance', { params: { id: String(w.body.payment_id) } }, 200);
    const rec = await record(j.constituent_id);
    assert.equal(rec.status, 'active');
    assert.equal(rec.payments[0].posting_status, 'not_applicable');
  });
});

test('a refund needs a reason, links to its payment, cannot exceed it, and leaves the term unpaid', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    const t = await tier();
    const j = await join({ tier_id: t.id, contact: { display_name: 'Refunded holder' } });
    const p = await call('POST', '/terms/:id/payments', 'finance', { params: { id: String(j.term_id) }, body: { amount: '100' } }, 201);
    const pid = String(p.body.payment_id);
    assert.equal((await call('POST', '/payments/:id/refund', 'finance', { params: { id: pid }, body: { amount: '20' } })).statusCode, 400);
    const tooMuch = await call('POST', '/payments/:id/refund', 'finance', { params: { id: pid }, body: { amount: '120', reason: 'Charged twice' } });
    assert.equal(tooMuch.statusCode, 400);
    await call('POST', '/payments/:id/refund', 'finance', { params: { id: pid }, body: { amount: '40', reason: 'Partly charged twice' } }, 201);
    await call('POST', '/payments/:id/refund', 'finance', { params: { id: pid }, body: { reason: 'Left the program' } }, 201);
    const full = await call('POST', '/payments/:id/refund', 'finance', { params: { id: pid }, body: { reason: 'Again' } });
    assert.equal(full.statusCode, 409);
    const rec = await record(j.constituent_id);
    assert.equal(rec.status, 'pending');
    const refunds = rec.payments.filter((x) => x.kind === 'refund');
    assert.deepEqual(refunds.map((x) => [x.amount_cents, x.refund_of_id, x.posting_status]).sort(), [[4000, Number(pid), 'unposted'], [6000, Number(pid), 'unposted']]);
  });
});

test('extending needs a reason and is logged with a count; ending needs a reason and shows as ended in the history', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    const t = await tier({ price: '0', name: 'Free' });
    const j = await join({ tier_id: t.id, contact: { display_name: 'Extended holder' } });
    const term = (await record(j.constituent_id)).terms[0];
    const newEnd = S.addDays(term.ends_on, 90);
    assert.equal((await call('POST', '/terms/:id/extend', 'fundraising', { params: { id: String(j.term_id) }, body: { ends_on: newEnd } })).statusCode, 400);
    assert.equal((await call('POST', '/terms/:id/extend', 'fundraising', { params: { id: String(j.term_id) }, body: { ends_on: term.starts_on, reason: 'Gift membership' } })).statusCode, 400);
    await call('POST', '/terms/:id/extend', 'fundraising', { params: { id: String(j.term_id) }, body: { ends_on: newEnd, reason: 'Gift membership' } }, 200);
    let rec = await record(j.constituent_id);
    assert.equal(rec.terms[0].ends_on, newEnd);
    assert.equal(rec.terms[0].extension_count, 1);
    const ext = rec.history.find((x) => x.field_name === 'ends_on');
    assert.equal(ext.old_value, term.ends_on);
    assert.equal(ext.metadata.reason, 'Gift membership');

    assert.equal((await call('POST', '/terms/:id/end', 'fundraising', { params: { id: String(j.term_id) }, body: {} })).statusCode, 400);
    await call('POST', '/terms/:id/end', 'fundraising', { params: { id: String(j.term_id) }, body: { reason: 'Moved away' } }, 200);
    rec = await record(j.constituent_id);
    assert.equal(rec.status, 'ended');
    assert.equal(rec.terms[0].status_reason, 'Moved away');
    assert.ok(rec.history.some((x) => x.field_name === 'status' && x.new_value === 'ended' && x.metadata.reason === 'Moved away'));
    assert.equal((await call('POST', '/terms/:id/payments', 'finance', { params: { id: String(j.term_id) }, body: { amount: '1' } })).statusCode, 409);
  });
});

test('renewals list: days to expiry, tier and last contact; a paid renewal drops off; a billed one does not', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const t = await s.tier({ name: 'Free', price: '0' });
    const other = await s.tier({ name: 'Other free', price: '0' });
    const soon = await s.join({ tier_id: t.id, starts_on: S.addDays(TODAY, -340), contact: { display_name: 'Ends soon' } });
    const later = await s.join({ tier_id: t.id, starts_on: S.addDays(TODAY, -200), contact: { display_name: 'Ends later' } });
    const otherTier = await s.join({ tier_id: other.id, starts_on: S.addDays(TODAY, -350), contact: { display_name: 'Other tier' } });
    const names = async (query) => (await s.call('GET', '/renewals', 'fundraising', { query }, 200)).body.renewals.map((x) => x.display_name);
    assert.deepEqual(await names({ days: '30' }), ['Other tier', 'Ends soon']);
    assert.deepEqual(await names({ days: '200' }), ['Other tier', 'Ends soon', 'Ends later']);
    assert.deepEqual(await names({ days: '30', tier_id: String(t.id) }), ['Ends soon']);
    await pool.query(`INSERT INTO org_constituent_interactions (org_id, constituent_id, interaction_date, description) VALUES ((SELECT org_id FROM org_membership_terms WHERE id = $1), $2, CURRENT_DATE, 'Called about renewal')`, [soon.term_id, soon.constituent_id]);
    assert.deepEqual(await names({ days: '30', no_contact_days: '7' }), ['Other tier']);

    const paidTier = await s.tier({ name: 'Paid' });
    await s.call('POST', '/dues-members/:id/terms', 'fundraising', { params: { id: String(otherTier.constituent_id) }, body: { tier_id: paidTier.id } }, 201);
    assert.deepEqual(await names({ days: '30' }), ['Other tier', 'Ends soon']);
    await s.call('POST', '/dues-members/:id/terms', 'fundraising', { params: { id: String(soon.constituent_id) }, body: {} }, 201);
    assert.deepEqual(await names({ days: '30' }), ['Other tier']);
    const tooEarly = await s.call('POST', '/dues-members/:id/terms', 'fundraising', { params: { id: String(later.constituent_id) }, body: {} });
    assert.equal(tooEarly.statusCode, 400);
    assert.match(tooEarly.body.error, /Renewals open/);
  });
});

test('fixed-year mode prorates a mid-year join by month and starts early joins on the next year', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join, record } = await setup(pool, asApp);
    await call('PUT', '/settings', 'finance', { body: { year_mode: 'fixed', fixed_start_month: 7, fixed_start_day: 1, proration_mode: 'monthly', renewal_window_days: 30 } }, 200);
    const t = await tier({ price: '120' });
    const mid = await join({ tier_id: t.id, starts_on: '2026-10-10', contact: { display_name: 'Mid-year joiner' } });
    const m = (await record(mid.constituent_id)).terms[0];
    assert.deepEqual([m.starts_on, m.ends_on, m.price_cents], ['2026-10-10', '2027-06-30', 9000]);
    const early = await join({ tier_id: t.id, starts_on: '2027-06-15', contact: { display_name: 'Early joiner' } });
    const e = (await record(early.constituent_id)).terms[0];
    assert.deepEqual([e.starts_on, e.ends_on, e.price_cents], ['2027-07-01', '2028-06-30', 12000]);
  });
});

test('settings: only finance and admins change them, bad values are refused, changes are logged', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, call } = await setup(pool, asApp);
    assert.equal((await call('PUT', '/settings', 'fundraising', { body: { grace_days: 10 } })).statusCode, 403);
    assert.equal((await call('PUT', '/settings', 'admin', { body: { grace_days: 999 } })).statusCode, 400);
    assert.equal((await call('PUT', '/settings', 'admin', { body: { recognition_mode: 'later' } })).statusCode, 400);
    await call('PUT', '/settings', 'admin', { body: { grace_days: 10, recognition_mode: 'at_receipt' } }, 200);
    const s = (await call('GET', '/settings', 'board', {}, 200)).body.settings;
    assert.equal(s.grace_days, 10);
    assert.equal(s.recognition_mode, 'at_receipt');
    const log = await pool.query(`SELECT field_name, old_value, new_value FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_membership_settings' ORDER BY field_name`, [ws.orgId]);
    assert.deepEqual(log.rows, [{ field_name: 'grace_days', old_value: '30', new_value: '10' }, { field_name: 'recognition_mode', old_value: 'spread', new_value: 'at_receipt' }]);
  });
});

test('access: board reads the summary only; donor-details holders read; the Membership manager writes; others get a plain message', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { call, tier, join } = await setup(pool, asApp);
    const t = await tier();
    const j = await join({ tier_id: t.id, contact: { display_name: 'Private holder', email: 'private@example.test' } });
    for (const path of ['/dues-members', '/renewals', '/dues-members/:id']) {
      const res = await call('GET', path, 'board', { params: { id: String(j.constituent_id) } });
      assert.equal(res.statusCode, 403, path);
      assert.equal(res.body.code, 'no_read_access');
      assert.match(res.body.error, /Ask an admin/);
      assert.doesNotMatch(JSON.stringify(res.body), /private@example/);
    }
    assert.equal((await call('GET', '/summary', 'board', {}, 200)).statusCode, 200);
    assert.equal((await call('GET', '/dues-members', 'program')).statusCode, 403);
    assert.equal((await call('GET', '/summary', 'program')).statusCode, 403);

    assert.equal((await call('GET', '/dues-members', 'reader', { permissions: ['donor_details'] })).statusCode, 200);
    assert.equal((await call('POST', '/terms/:id/payments', 'reader', { permissions: ['donor_details'], params: { id: String(j.term_id) }, body: { amount: '1' } })).statusCode, 403);
    assert.equal((await call('POST', '/terms/:id/payments', 'manager', { permissions: ['manage_membership'], params: { id: String(j.term_id) }, body: { amount: '1' } })).statusCode, 201);
    assert.equal((await call('GET', '/dues-members/:id', 'manager', { permissions: ['manage_membership'], params: { id: String(j.constituent_id) } })).statusCode, 200);
    assert.equal((await call('POST', '/tiers', 'fundraising', { body: { name: 'X', price: '1' } })).statusCode, 403);
    assert.equal((await call('POST', '/tiers', 'manager', { permissions: ['manage_membership'], body: { name: 'X', price: '1' } })).statusCode, 403);
    assert.equal((await call('GET', '/dues-members/export.csv', 'fundraising')).statusCode, 403);
    const csv = await call('GET', '/dues-members/export.csv', 'finance', {}, 200);
    assert.match(csv.body, /^display_name,/);
    assert.match(csv.body, /Private holder/);
  });
});

test('row-level security: another workspace sees no terms, payments, settings or templates', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const { ws, tier, join, call } = await setup(pool, asApp);
    const t = await tier();
    const j = await join({ tier_id: t.id, contact: { display_name: 'Isolated holder' } });
    await call('POST', '/terms/:id/payments', 'finance', { params: { id: String(j.term_id) }, body: { amount: '100' } }, 201);
    await call('PUT', '/settings', 'finance', { body: { grace_days: 5 } }, 200);
    await asOwner();
    const other = await seed(pool);
    await asApp(other.orgId);
    for (const table of ['org_membership_terms', 'org_membership_payments', 'org_membership_settings', 'org_membership_tier_prices', 'org_membership_templates', 'org_membership_messages', 'org_membership_seats']) {
      const r = await pool.query(`SELECT count(*)::int AS n FROM ${table}`);
      assert.equal(r.rows[0].n, 0, table);
    }
    await assert.rejects(pool.query(`INSERT INTO org_membership_terms (org_id, constituent_id, starts_on, ends_on) VALUES ($1, $2, CURRENT_DATE, CURRENT_DATE)`, [ws.orgId, j.constituent_id]), /row-level security/);
  });
});
