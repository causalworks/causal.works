'use strict';

// Sponsorship S5 against a throwaway database: pre-approved grant releases (receiving entity, W-9, grant agreement on every
// release), the release history and the information-return sheet, and closing a project with a recorded transfer.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const { thresholdForYear } = require('../../server/organizational/lib/sponsorGrants');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug';

test('information-return threshold by year falls back to the latest earlier year', () => {
  assert.equal(thresholdForYear({ 2026: 200000 }, 2026), 200000);
  assert.equal(thresholdForYear({ 2026: 200000 }, 2027), 200000);
  assert.equal(thresholdForYear({ 2026: 200000 }, 2025), null);
});

async function setup(pool, asApp, model) {
  const ws = await h.seedWorkspace(pool);
  const project = await h.seedProject(pool, ws, { model: model || 'model_c', rule: { kind: 'percent', rate: 0 } });
  await h.seedPostedGift(pool, ws, project, 500000, '2026-01-10');
  const entity = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Receiving entity', 'organization') RETURNING id`, [ws.orgId]);
  const other = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Some vendor', 'organization') RETURNING id`, [ws.orgId]);
  const doc = async (title) => (await h.one(pool,
    `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, sponsored_project_id)
     VALUES ($1, 'other', $2, 'a.pdf', 'x/a.pdf', 'application/pdf', 1, md5(random()::text), $3) RETURNING id`, [ws.orgId, title, project.id])).id;
  await asApp(ws.orgId);
  const sp = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
  const pr = h.loadRoutes('routes/sponsored-projects.js', 'registerSponsoredProjectsRoutes', pool);
  const rec = h.loadRoutes('routes/sponsorshipRecords.js', 'registerSponsorshipRecordRoutes', pool);
  const as = (i, extra) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { slug: ws.slug, id: String(project.id), ...(extra || {}) } });
  return { ws, project, entity, other, doc, sp, pr, rec, as };
}

test('grant model: no entity, no W-9, wrong payee and a missing grant agreement are each refused; then the release goes through', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, entity, other, doc, sp, pr, as } = await setup(pool, asApp);
    const disb = P + '/sponsored-projects/:id/disbursements';
    let res = await pr.call('POST', disb, { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 100000 } });
    assert.equal(res.body.code, 'no_receiving_entity');
    res = await sp.call('POST', P + '/sponsored-projects/:id/grant-entity', { ...as(1), body: { receiving_constituent_id: entity.id } });
    assert.equal(res.statusCode, 200);
    res = await pr.call('POST', disb, { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 100000 } });
    assert.equal(res.body.code, 'w9_missing');
    assert.match(res.body.error, /W-9/);
    const w9 = await doc('W-9');
    res = await sp.call('POST', P + '/sponsored-projects/:id/grant-entity', { ...as(1), body: { w9_document_id: w9, w9_received_at: '2026-01-20' } });
    assert.equal(res.body.w9_on_file, true);
    res = await pr.call('POST', disb, { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 100000, payee_constituent_id: other.id } });
    assert.equal(res.body.code, 'payee_not_entity');
    res = await pr.call('POST', disb, { ...as(1), body: { disbursement_date: '2026-02-01', amount_cents: 100000 } });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.disbursement.payee_constituent_id, entity.id);
    const disbId = String(res.body.disbursement.id);

    const approve = P + '/sponsored-projects/:id/disbursements/:disbId/approve';
    res = await pr.call('POST', approve, { ...as(4, { disbId }) });
    assert.equal(res.body.code, 'grant_agreement_missing');
    const ga = await doc('Grant agreement, first release');
    res = await sp.call('POST', P + '/sponsored-projects/:id/disbursements/:disbId/grant-agreement', { ...as(1, { disbId }), body: { document_id: ga } });
    assert.equal(res.statusCode, 200);
    res = await pr.call('POST', approve, { ...as(4, { disbId }) });
    assert.equal(res.body.status, 'approved', JSON.stringify(res.body));

    const { postDisbursement } = require('../../server/organizational/lib/disbursementPosting');
    const posted = await postDisbursement(pool, { orgId: ws.orgId, userId: ws.users[1].id, disbursementId: Number(disbId), postingDate: '2026-02-05', bankAccountId: ws.accounts.bank });
    assert.equal(posted.httpStatus, 200);
    res = await sp.call('GET', P + '/sponsored-projects/:id/releases', as(2));
    assert.equal(res.body.model, 'model_c');
    assert.equal(res.body.releases.length, 1);
    assert.equal(res.body.releases[0].payee_name, 'Receiving entity');
    assert.equal(res.body.releases[0].posted, true);
  });
});

test('grant model request: approving needs the grant agreement; the information-return sheet flags the entity at the threshold', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, entity, other, doc, sp, rec, as } = await setup(pool, asApp);
    const w9 = await doc('W-9');
    await sp.call('POST', P + '/sponsored-projects/:id/grant-entity', { ...as(1), body: { receiving_constituent_id: entity.id, w9_document_id: w9 } });
    let res = await sp.call('POST', P + '/sponsored-projects/:id/payment-requests', { ...as(1), body: { payee_constituent_id: other.id, amount_cents: 250000, purpose: 'Release' } });
    assert.equal(res.body.code, 'payee_not_entity');
    res = await sp.call('POST', P + '/sponsored-projects/:id/payment-requests', { ...as(1), body: { payee_constituent_id: entity.id, amount_cents: 250000, purpose: 'Second-quarter release' } });
    const requestId = String(res.body.request.id);
    const review = P + '/sponsored-projects/:id/payment-requests/:requestId/review';
    res = await sp.call('POST', review, { ...as(4, { requestId }), body: { action: 'approve' } });
    assert.equal(res.body.code, 'grant_agreement_missing');
    const ga = await doc('Grant agreement, second release');
    res = await sp.call('POST', review, { ...as(4, { requestId }), body: { action: 'approve', grant_agreement_document_id: ga } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const { postDisbursement } = require('../../server/organizational/lib/disbursementPosting');
    await postDisbursement(pool, { orgId: ws.orgId, userId: ws.users[1].id, disbursementId: res.body.disbursement_id, postingDate: '2026-04-02', bankAccountId: ws.accounts.bank });

    res = await rec.call('GET', P + '/sponsor-reports/information-returns', { ...as(1), query: { year: '2026' } });
    assert.equal(res.body.threshold_cents, 200000);
    assert.deepEqual(res.body.rows.map((r) => [r.entity_name, r.total_cents, r.needs_information_return]), [['Receiving entity', 250000, true]]);
    const csv = await rec.call('GET', P + '/sponsor-reports/information-returns', { ...as(1), query: { year: '2026', format: 'csv' } });
    assert.match(String(csv.body), /Receiving entity,Project A,2500\.00,0\.00,2500\.00,1,yes/);
  });
});

test('closing: winding down first, a document for a new sponsor, no more than is available; posting ends the project', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, other, doc, sp, pr, as } = await setup(pool, asApp, 'model_a');
    const path = P + '/sponsored-projects/:id/closing';
    const body = { destination_kind: 'new_sponsor', destination_constituent_id: other.id, amount_cents: 500000, closing_date: '2026-06-30', reason: 'Moving to a new sponsor' };
    let res = await sp.call('POST', path, { ...as(1), body });
    assert.equal(res.body.code, 'not_winding_down');
    res = await pr.call('PATCH', P + '/sponsored-projects/:id', { ...as(1), body: { status: 'winding_down' } });
    assert.equal(res.statusCode, 200);
    res = await sp.call('POST', path, { ...as(2), body });
    assert.equal(res.statusCode, 403);
    res = await sp.call('POST', path, { ...as(1), body: { ...body, reason: '' } });
    assert.equal(res.body.code, 'reason_required');
    res = await sp.call('POST', path, { ...as(1), body });
    assert.equal(res.body.code, 'document_required');
    const agreement = await doc('Agreement with the new sponsor');
    res = await sp.call('POST', path, { ...as(1), body: { ...body, document_id: agreement, amount_cents: 500001 } });
    assert.equal(res.body.code, 'over_balance');
    res = await sp.call('POST', path, { ...as(1), body: { ...body, document_id: agreement } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const closingId = String(res.body.closing.id);
    res = await sp.call('POST', path, { ...as(1), body: { ...body, document_id: agreement } });
    assert.equal(res.statusCode, 409);

    res = await sp.call('POST', P + '/sponsor-closings/:closingId/post', { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, params: { closingId }, body: { bank_account_id: ws.accounts.bank } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const p = await h.one(pool, 'SELECT status FROM org_sponsored_projects WHERE id = $1', [project.id]);
    assert.equal(p.status, 'ended');
    res = await sp.call('GET', P + '/sponsored-projects/:id/balance', as(1));
    assert.equal(res.body.balance.available_cents, 0);
    assert.equal(res.body.balance.closing_transferred_cents, 500000);
    assert.equal(res.body.balance.tie_out.difference_cents, 0);
    const t = await h.one(pool, `SELECT t.source FROM org_sponsor_closings c JOIN org_ledger_transactions t ON t.id = c.ledger_transaction_id WHERE c.id = $1`, [closingId]);
    assert.equal(t.source, 'sponsor_closing');

    const gift = await h.one(pool,
      `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, posting_status, payment_method, in_kind_description, in_kind_valuation_method)
       VALUES ($1, 'donation', 100, '2026-07-01', $2, 'unposted', 'in_kind', 'Chairs', 'comparable_sales') RETURNING id`, [ws.orgId, project.id]);
    const { postInKindGift } = require('../../server/organizational/lib/giftPosting');
    const out = await postInKindGift(pool, { orgId: ws.orgId, userId: ws.users[1].id, giftId: gift.id, postingDate: '2026-07-01', revenueAccountId: 1, expenseAccountId: 1, programId: 1 });
    assert.equal(out.body.code, 'sponsored_project_ended');

    res = await sp.call('POST', P + '/sponsor-closings/:closingId/void', { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, params: { closingId }, body: { reason: 'Recorded against the wrong bank account' } });
    assert.equal(res.statusCode, 200);
    const back = await h.one(pool, 'SELECT status FROM org_sponsored_projects WHERE id = $1', [project.id]);
    assert.equal(back.status, 'winding_down');
  });
});
