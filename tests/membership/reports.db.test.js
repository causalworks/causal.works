'use strict';

// Membership reports and CSV import against a throwaway database.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';

async function setup(pool, asApp) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Garden Network', 'rep-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const users = {};
  for (const role of ['admin', 'finance', 'fundraising', 'board']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  await asApp(org.id);
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const call = async (method, path, role, extra, expect) => {
    const res = await staff.call(method, B + path, { user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + path + ' ' + JSON.stringify(res.body));
    return res;
  };
  const tier = async (name, price) => (await call('POST', '/tiers', 'finance', { body: { name, price, effective_on: '2020-01-01' } }, 201)).body.tier;
  const join = async (t, startsOn, name) => (await call('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, starts_on: startsOn, contact: { display_name: name } } }, 201)).body;
  const pay = (termId, amount, date) => call('POST', '/terms/:id/payments', 'finance', { params: { id: String(termId) }, body: { amount, payment_date: date } }, 201);
  const report = async (name, query, role) => (await call('GET', '/reports/:name', role || 'finance', { params: { name }, query }, 200)).body;
  return { org, call, tier, join, pay, report };
}

test('joins, renewals, retention, revenue by tier, growth and lapse reasons', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const std = await s.tier('Standard', '100');
    const free = await s.tier('Free', '0');
    const a = await s.join(std, '2025-01-10', 'Renewer');
    const b = await s.join(std, '2025-02-15', 'Leaver');
    const c = await s.join(free, '2025-02-20', 'Ended one');
    await s.pay(a.term_id, '100', '2025-01-10');
    await s.pay(b.term_id, '100', '2025-02-15');
    const ren = await s.call('POST', '/dues-members/:id/terms', 'fundraising', { params: { id: String(a.constituent_id) }, body: { on: '2025-12-20' } }, 201);
    await s.pay(ren.body.term_id, '100', '2025-12-20');
    await s.call('POST', '/terms/:id/end', 'fundraising', { params: { id: String(c.term_id) }, body: { reason: 'Moved away', ended_on: '2025-06-01' } }, 200);
    const pid = (await s.pay(b.term_id, '20', '2025-03-01')).body.payment_id;
    await s.call('POST', '/payments/:id/refund', 'finance', { params: { id: String(pid) }, body: { reason: 'Paid twice', payment_date: '2025-03-02' } }, 201);

    const joins = await s.report('joins', { from: '2025-01-01', to: '2026-01-31' });
    const jm = Object.fromEntries(joins.rows.map((r) => [r.month, [r.joins, r.renewals]]));
    assert.deepEqual([jm['2025-01'], jm['2025-02'], jm['2026-01']], [[1, 0], [2, 0], [0, 1]]);
    const ret = await s.report('retention', { from: '2026-01-01', to: '2026-02-28' });
    assert.deepEqual(ret.rows[0], { terms_ending: 2, renewed: 1, retention_rate: 50 });
    const rev = await s.report('revenue', { from: '2025-01-01', to: '2025-12-31' });
    assert.deepEqual(rev.rows.find((r) => r.tier === 'Standard').received_cents, 30000);
    const growth = await s.report('growth', { from: '2025-01-01', to: '2025-03-31' });
    assert.deepEqual(growth.rows.map((r) => [r.month, r.active]), [['2025-01', 1], ['2025-02', 3], ['2025-03', 3]]);
    const lapses = await s.report('lapses', { from: '2025-01-01', to: '2026-12-31' });
    assert.deepEqual(lapses.rows, [{ reason: 'Moved away', count: 1 }, { reason: 'Did not renew', count: 1 }]);
    const csv = await s.call('GET', '/reports/:name', 'board', { params: { name: 'revenue' }, query: { from: '2025-01-01', to: '2025-12-31', format: 'csv' } }, 200);
    assert.match(csv.body, /^tier,received,waived,contribution,dues_revenue\r\n/);
    assert.match(csv.body, /Standard,300\.00,/);
    assert.equal((await s.call('GET', '/reports/:name', 'finance', { params: { name: 'nope' } })).statusCode, 404);
    assert.equal((await s.call('GET', '/reports/:name', 'finance', { params: { name: 'joins' }, query: { from: '2025-05-01', to: '2025-01-01' } })).statusCode, 400);
  });
});

test('aging of unpaid dues: board members see the totals only, finance sees who owes', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    const std = await s.tier('Standard', '100');
    const today = require('../../server/organizational/lib/membership').today();
    const S = require('../../server/organizational/lib/membershipStatus');
    await s.join(std, S.addDays(today, -10), 'Recent');
    await s.join(std, S.addDays(today, -45), 'Older');
    const paid = await s.join(std, S.addDays(today, -100), 'Paid up');
    await s.pay(paid.term_id, '100', today);
    const fin = await s.report('aging', {});
    assert.deepEqual(fin.rows.filter((r) => r.terms).map((r) => [r.bucket, r.terms, r.owed_cents]), [['0_30', 1, 10000], ['31_60', 1, 10000]]);
    assert.deepEqual(fin.detail.map((d) => d.display_name), ['Older', 'Recent']);
    const board = await s.report('aging', {}, 'board');
    assert.equal(board.detail, undefined);
    assert.doesNotMatch(JSON.stringify(board), /Older|Recent/);
  });
});

test('CSV import: preview counts new, changed, unchanged, duplicates and errors; nothing saved until confirmed', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const s = await setup(pool, asApp);
    await s.tier('Standard', '50');
    await pool.query(`INSERT INTO org_constituents (org_id, display_name, email, kind) VALUES ($1, 'Existing donor', 'known@example.test', 'individual')`, [s.org.id]);
    const csv = [
      'name,email,phone,tier,start_date,amount_paid',
      'New person,new@example.test,555-0001,Standard,2026-01-01,50',
      'Existing donor,KNOWN@example.test,555-0002,Standard,2026-01-01,',
      'Repeat,new@example.test,,Standard,2026-01-01,',
      'Bad tier,bad@example.test,,Gold,2026-01-01,',
    ].join('\n');
    assert.equal((await s.call('POST', '/import/preview', 'fundraising', { body: { csv } })).statusCode, 403);
    const pv = await s.call('POST', '/import/preview', 'finance', { body: { csv } }, 200);
    assert.deepEqual(pv.body.counts, { new: 1, changed: 1, unchanged: 0, duplicates: 1, errors: 1 });
    assert.deepEqual(pv.body.changed[0].changes, ['phone', 'term']);
    assert.match(pv.body.errors[0].error, /Gold/);
    assert.equal((await h.one(pool, 'SELECT count(*)::int AS n FROM org_membership_terms WHERE org_id = $1', [s.org.id])).n, 0);
    const blocked = await s.call('POST', '/import', 'finance', { body: { csv } });
    assert.equal(blocked.statusCode, 400);
    const fixed = csv.split('\n').filter((l) => !l.startsWith('Bad tier')).join('\n');
    const done = await s.call('POST', '/import', 'finance', { body: { csv: fixed } }, 200);
    assert.deepEqual([done.body.contacts_created, done.body.contacts_updated, done.body.terms_created, done.body.payments_created, done.body.skipped_duplicates], [1, 1, 2, 1, 1]);
    const known = await h.one(pool, `SELECT phone FROM org_constituents WHERE org_id = $1 AND display_name = 'Existing donor'`, [s.org.id]);
    assert.equal(known.phone, '555-0002');
    const again = await s.call('POST', '/import/preview', 'finance', { body: { csv: fixed } }, 200);
    assert.deepEqual(again.body.counts, { new: 0, changed: 0, unchanged: 2, duplicates: 1, errors: 0 });
    const list = (await s.call('GET', '/dues-members', 'finance', {}, 200)).body.dues_members;
    assert.deepEqual(list.map((x) => [x.display_name, x.status]), [['Existing donor', 'pending'], ['New person', 'active']]);
  });
});
