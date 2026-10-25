'use strict';

// Sponsorship S2 against a throwaway database: payment requests, the balance check and admin override,
// own-approval and two-person approval, holds (manual and overdue report), recalls, and the dashboard flag.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug';

async function setup(pool, asApp, giftCents) {
  const ws = await h.seedWorkspace(pool);
  const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 0 } });
  if (giftCents) await h.seedPostedGift(pool, ws, project, giftCents, '2026-01-15');
  const payee = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Venue vendor', 'organization') RETURNING id`, [ws.orgId]);
  await asApp(ws.orgId);
  const sp = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
  const pr = h.loadRoutes('routes/sponsored-projects.js', 'registerSponsoredProjectsRoutes', pool);
  const as = (i, extra) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { id: String(project.id), ...(extra || {}) } });
  return { ws, project, payee, sp, pr, as };
}

test('over-balance request is refused with a plain message; only an admin with a reason may override, and it is shown', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, payee, sp, pr, as } = await setup(pool, asApp, 100000);
    const path = P + '/sponsored-projects/:id/payment-requests';
    let res = await sp.call('POST', path, { ...as(1), body: { payee_constituent_id: payee.id, amount_cents: 150000, purpose: 'Venue', method: 'check' } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'over_balance');
    assert.match(res.body.error, /\$1,000\.00 available/);

    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 150000, override: true, override_reason: 'Grant arriving' } });
    assert.equal(res.body.code, 'override_admin_only');
    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(0), body: { disbursement_date: '2026-02-01', amount_cents: 150000, override: true } });
    assert.equal(res.body.code, 'reason_required');
    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(0), body: { disbursement_date: '2026-02-01', amount_cents: 150000, override: true, override_reason: 'Grant payment confirmed for next week' } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));

    res = await sp.call('GET', P + '/sponsored-projects/:id/balance', as(2));
    assert.equal(res.body.overrides.length, 1);
    assert.equal(res.body.overrides[0].reason, 'Grant payment confirmed for next week');
    assert.equal(res.body.balance.negative, true);
    const audit = await pool.query(`SELECT metadata FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_sponsored_project_disbursements'`, [ws.orgId]);
    assert.ok(audit.rows.some((a) => a.metadata && a.metadata.override_reason));
    void project;
  });
});

test('request review: approve creates a disbursement; reject needs a reason; the person who entered it cannot approve it', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { payee, sp, as } = await setup(pool, asApp, 100000);
    const path = P + '/sponsored-projects/:id/payment-requests';
    let res = await sp.call('POST', path, { ...as(1), body: { payee_constituent_id: payee.id, amount_cents: 20000, purpose: 'Printing' } });
    assert.equal(res.statusCode, 201);
    const reqId = String(res.body.request.id);
    res = await sp.call('POST', path, { ...as(1), body: { payee_constituent_id: payee.id, amount_cents: 0, purpose: 'x' } });
    assert.equal(res.body.code, 'amount_required');

    const review = path + '/:requestId/review';
    res = await sp.call('POST', review, { ...as(1, { requestId: reqId }), body: { action: 'approve' } });
    assert.equal(res.body.code, 'self_approval');
    res = await sp.call('POST', review, { ...as(2, { requestId: reqId }), body: { action: 'approve' } });
    assert.equal(res.statusCode, 403);
    res = await sp.call('POST', review, { ...as(4, { requestId: reqId }), body: { action: 'reject' } });
    assert.equal(res.body.code, 'reason_required');
    res = await sp.call('POST', review, { ...as(4, { requestId: reqId }), body: { action: 'approve' } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.ok(res.body.disbursement_id);
    const d = await pool.query('SELECT status, payment_request_id FROM org_sponsored_project_disbursements WHERE id = $1', [res.body.disbursement_id]);
    assert.equal(d.rows[0].status, 'approved');
    res = await sp.call('GET', P + '/sponsored-projects/:id/balance', as(1));
    assert.equal(res.body.balance.pending_cents, 20000);
    assert.equal(res.body.balance.available_cents, 80000);
  });
});

test('request outside the approved budget gets a warning, not a block', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { project, payee, sp, as } = await setup(pool, asApp, 100000);
    await pool.query('UPDATE org_sponsored_projects SET annual_budget_estimate = 100 WHERE id = $1', [project.id]);
    const res = await sp.call('POST', P + '/sponsored-projects/:id/payment-requests', { ...as(1), body: { payee_constituent_id: payee.id, amount_cents: 20000, purpose: 'Printing' } });
    assert.equal(res.statusCode, 201);
    assert.match(res.body.budget_warning, /above the approved budget/);
  });
});

test('a creator cannot approve their own disbursement; above the threshold two different people must approve', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { pr, as } = await setup(pool, asApp, 2000000);
    let res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 600000 } });
    const disbId = String(res.body.disbursement.id);
    const approve = P + '/sponsored-projects/:id/disbursements/:disbId/approve';
    res = await pr.call('POST', approve, { ...as(1, { disbId }) });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'self_approval');
    assert.match(res.body.error, /different person/);
    res = await pr.call('POST', approve, { ...as(4, { disbId }) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.needs_second_approval, true);
    res = await pr.call('POST', approve, { ...as(4, { disbId }) });
    assert.equal(res.body.code, 'second_approver_same');
    res = await pr.call('POST', approve, { ...as(0, { disbId }) });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'approved');

    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 1000 } });
    res = await pr.call('POST', approve, { ...as(4, { disbId: String(res.body.disbursement.id) }) });
    assert.equal(res.body.status, 'approved');
  });
});

test('a held project refuses requests, disbursements and approvals; lifting needs a reason', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { payee, sp, pr, as } = await setup(pool, asApp, 100000);
    let res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 1000 } });
    const disbId = String(res.body.disbursement.id);
    res = await sp.call('POST', P + '/sponsored-projects/:id/hold', { ...as(1), body: {} });
    assert.equal(res.body.code, 'reason_required');
    res = await sp.call('POST', P + '/sponsored-projects/:id/hold', { ...as(2), body: { reason: 'x' } });
    assert.equal(res.statusCode, 403);
    res = await sp.call('POST', P + '/sponsored-projects/:id/hold', { ...as(1), body: { reason: 'Insurance lapsed' } });
    assert.equal(res.statusCode, 200);

    res = await sp.call('POST', P + '/sponsored-projects/:id/payment-requests', { ...as(1), body: { payee_constituent_id: payee.id, amount_cents: 1000, purpose: 'x' } });
    assert.equal(res.body.code, 'project_on_hold');
    assert.match(res.body.error, /Insurance lapsed/);
    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements', { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 1000 } });
    assert.equal(res.body.code, 'project_on_hold');
    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements/:disbId/approve', { ...as(4, { disbId }) });
    assert.equal(res.body.code, 'project_on_hold');
    res = await pr.call('PATCH', P + '/sponsored-projects/:id', { ...as(1), body: { status: 'active' } });
    assert.equal(res.body.code, 'project_on_hold');

    res = await sp.call('POST', P + '/sponsored-projects/:id/lift-hold', { ...as(1), body: { reason: 'Certificate received' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'active');
    res = await pr.call('POST', P + '/sponsored-projects/:id/disbursements/:disbId/approve', { ...as(4, { disbId }) });
    assert.equal(res.body.status, 'approved');
  });
});

test('overdue report: the daily function holds the project, is safe to rerun, lifts when the report is in, and an admin waiver sticks', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, project, sp, as } = await setup(pool, asApp, 100000);
    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET next_report_due = CURRENT_DATE - 31 WHERE id = $1`, [project.id]);
    await asApp(ws.orgId);
    let r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    assert.deepEqual(r.rows.filter((x) => x.sponsored_project_id === project.id).map((x) => x.action), ['placed']);
    r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    assert.equal(r.rows.filter((x) => x.sponsored_project_id === project.id).length, 0);
    let p = await h.one(pool, 'SELECT status, hold_reason, hold_kind FROM org_sponsored_projects WHERE id = $1', [project.id]);
    assert.deepEqual([p.status, p.hold_reason], ['on_hold', 'report overdue']);

    let res = await sp.call('POST', P + '/sponsored-projects/:id/lift-hold', { ...as(1), body: { reason: 'Report promised' } });
    assert.equal(res.body.code, 'admin_only');
    res = await sp.call('POST', P + '/sponsored-projects/:id/lift-hold', { ...as(0), body: { reason: 'Report arrives Friday' } });
    assert.equal(res.statusCode, 200);
    r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    assert.equal(r.rows.filter((x) => x.sponsored_project_id === project.id).length, 0);

    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET report_hold_waived_for = NULL WHERE id = $1`, [project.id]);
    await asApp(ws.orgId);
    await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    await pool.query(`UPDATE org_sponsored_projects SET last_report_received_at = CURRENT_DATE WHERE id = $1`, [project.id]);
    r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    assert.deepEqual(r.rows.filter((x) => x.sponsored_project_id === project.id).map((x) => x.action), ['lifted']);
    p = await h.one(pool, 'SELECT status FROM org_sponsored_projects WHERE id = $1', [project.id]);
    assert.equal(p.status, 'active');
  });
});

test('recall: needs a reason, waits for Accounting, then lowers the balance and keeps the tie-out', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, sp, as } = await setup(pool, asApp, 100000);
    let res = await sp.call('POST', P + '/sponsored-projects/:id/recalls', { ...as(1), body: { amount_cents: 30000 } });
    assert.equal(res.body.code, 'reason_required');
    res = await sp.call('POST', P + '/sponsored-projects/:id/recalls', { ...as(1), body: { amount_cents: 30000, reason: 'Restricted grant terms broken', recall_date: '2026-03-01' } });
    assert.equal(res.statusCode, 201);
    const recallId = String(res.body.recall.id);
    res = await sp.call('GET', P + '/sponsored-projects/:id/balance', as(1));
    assert.equal(res.body.balance.pending_recalls_cents, 30000);
    assert.equal(res.body.balance.available_cents, 70000);

    res = await sp.call('POST', P + '/sponsor-recalls/:recallId/post', { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, params: { recallId } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    res = await sp.call('GET', P + '/sponsored-projects/:id/balance', as(1));
    assert.equal(res.body.balance.recalled_posted_cents, 30000);
    assert.equal(res.body.balance.other_spending_cents, 0);
    assert.equal(res.body.balance.available_cents, 70000);
    assert.equal(res.body.balance.tie_out.difference_cents, 0);
  });
});

test('dashboard flags a negative or held project', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, sp, as } = await setup(pool, asApp, 0);
    await sp.call('POST', P + '/sponsored-projects/:id/hold', { ...as(1), body: { reason: 'Board review' } });
    const { fetchAttentionFeed } = require('../../server/organizational/lib/OrganizationalAttentionFeed');
    const feed = await fetchAttentionFeed(pool, ws.orgId, ws.slug, { coopOrgRole: 'admin', accessPermissions: [], user: { id: ws.users[0].id }, orgId: ws.orgId });
    const items = (feed.items || feed).filter((i) => i.type === 'sponsored_project' && i.flag === 'danger' && /on hold/.test(i.title));
    assert.equal(items.length, 1);
    assert.match(items[0].title, /on hold: Board review/);
    void project;
  });
});
