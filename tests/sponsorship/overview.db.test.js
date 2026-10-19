'use strict';

// Sponsorship overview routes against a throwaway database: the Projects grid and top numbers, the money-out queue,
// and a project's history; who may read each.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug';

async function setup(pool, asApp) {
  const ws = await h.seedWorkspace(pool);
  const a = await h.seedProject(pool, ws, { name: 'Project 1', rule: { kind: 'percent', rate: 10 } });
  const b = await h.seedProject(pool, ws, { name: 'Project 2', programId: ws.programs.projectB, rule: { kind: 'percent', rate: 0 } });
  await pool.query(`UPDATE org_sponsored_projects SET agreement_signed_at = '2026-01-01' WHERE id = $1`, [a.id]);
  await h.seedPostedGift(pool, ws, a, 100000, '2026-01-15');
  await asApp(ws.orgId);
  const sp = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
  const as = (i, extra) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { ...(extra || {}) } });
  return { ws, a, b, sp, as };
}

test('overview: one row per project with held, available, fees due and flags; totals match the rows', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { a, b, sp, as } = await setup(pool, asApp);
    const res = await sp.call('GET', P + '/sponsorship/overview', as(1));
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const rowA = res.body.projects.find((p) => p.id === a.id);
    const rowB = res.body.projects.find((p) => p.id === b.id);
    assert.equal(rowA.held_cents, 90000);
    assert.equal(rowA.available_cents, 90000);
    assert.equal(rowA.fee.rate, 10);
    assert.equal(rowA.flags.agreement_missing, false);
    assert.equal(rowB.flags.agreement_missing, true);
    assert.equal(rowB.attention, true);
    assert.ok(rowA.fees_due_cents >= 0);
    const t = res.body.totals;
    assert.equal(t.held_cents, res.body.projects.reduce((s, p) => s + p.held_cents, 0));
    assert.equal(t.attention_count, res.body.projects.filter((p) => p.attention).length);
  });
});

test('overview: a project put on hold is flagged and counted', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { a, sp, as } = await setup(pool, asApp);
    await pool.query(`UPDATE org_sponsored_projects SET status = 'on_hold', hold_reason = 'Report missing', hold_kind = 'manual' WHERE id = $1`, [a.id]);
    const res = await sp.call('GET', P + '/sponsorship/overview', as(1));
    const rowA = res.body.projects.find((p) => p.id === a.id);
    assert.equal(rowA.flags.hold, true);
    assert.equal(rowA.attention, true);
  });
});

test('money-out queue lists open requests, disbursements waiting and pending recalls', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, sp, as } = await setup(pool, asApp);
    const payee = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Vendor 1', 'organization') RETURNING id`, [ws.orgId]);
    let res = await sp.call('POST', P + '/sponsored-projects/:id/payment-requests', { ...as(1, { id: String(a.id) }), body: { payee_constituent_id: payee.id, amount_cents: 20000, purpose: 'Supplies', method: 'check' } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    res = await sp.call('POST', P + '/sponsored-projects/:id/recalls', { ...as(1, { id: String(a.id) }), body: { amount_cents: 5000, reason: 'Unused funds', recall_date: '2026-03-01' } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    res = await sp.call('GET', P + '/sponsorship/money-out', as(1));
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.requests.length, 1);
    assert.equal(res.body.requests[0].project_name, 'Project 1');
    assert.equal(res.body.recalls.filter((r) => r.status === 'pending').length, 1);
  });
});

test('history shows audit entries for the project and its records; only finance and admins may read it', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { a, sp, as } = await setup(pool, asApp);
    let res = await sp.call('POST', P + '/sponsored-projects/:id/hold', { ...as(1, { id: String(a.id) }), body: { reason: 'Waiting for a report' } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    res = await sp.call('GET', P + '/sponsored-projects/:id/history', as(1, { id: String(a.id) }));
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(res.body.entries.some((e) => e.table_name === 'org_sponsored_projects'));
    res = await sp.call('GET', P + '/sponsored-projects/:id/history', as(2, { id: String(a.id) }));
    assert.equal(res.statusCode, 403);
  });
});

test('overview is refused to a workspace user without sponsorship read access', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, sp } = await setup(pool, asApp);
    const res = await sp.call('GET', P + '/sponsorship/overview', { user: ws.users[0].id, role: 'fundraising', orgId: ws.orgId, params: {} });
    assert.equal(res.statusCode, 403);
  });
});
