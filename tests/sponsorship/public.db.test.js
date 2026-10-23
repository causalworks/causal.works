'use strict';

// Shared public module and project lead links against a throwaway database: a link opens exactly one project; revoked,
// expired and used links are refused; tokens are never stored; every use is logged; forms refuse the honeypot, a too-fast
// submit and too many tries; a lead's request, report and document land on their project; the public page shows only
// what the workspace turned on.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const opts = { skip: h.SKIP };
process.env.CAUSAL_UPLOADS_ROOT = process.env.CAUSAL_UPLOADS_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-test-'));
const P = '/api/organizational/orgs/:slug';

async function setup(pool, asApp) {
  const ws = await h.seedWorkspace(pool);
  const a = await h.seedProject(pool, ws, { name: 'Project A', programId: ws.programs.projectA });
  const b = await h.seedProject(pool, ws, { name: 'Project B', programId: ws.programs.projectB });
  const donor = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Donor of record', 'individual') RETURNING id`, [ws.orgId]);
  const g = await h.seedPostedGift(pool, ws, a, 80000, '2026-01-10');
  await pool.query('UPDATE org_gifts SET constituent_id = $1 WHERE id = $2', [donor.id, g.giftId]);
  await h.seedPostedGift(pool, ws, b, 999900, '2026-01-10');
  await asApp(ws.orgId);
  const staff = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
  const pub = h.loadRoutes('public/index.js', 'registerPublicRoutes', pool);
  const asStaff = (i, id) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { slug: ws.slug, id: String(id) } });
  const link = async (projectId) => {
    const res = await staff.call('POST', P + '/sponsored-projects/:id/lead-links', { ...asStaff(1, projectId), body: { days: 30 } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    return { id: res.body.id, token: res.body.url.split('#t=')[1], url: res.body.url };
  };
  return { ws, a, b, staff, pub, asStaff, link };
}

const { issueFormToken } = require('../../server/organizational/lib/publicLinks');
const form = (ws) => ({ form_token: issueFormToken(ws.orgId, Date.now() - 5000) });

test('a lead link opens exactly one project, shows no donor names, and every use is logged; the token is never stored', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, pub, link } = await setup(pool, asApp);
    const l = await link(a.id);
    assert.match(l.url, /\/p\/[^/]+\/lead#t=/);
    const res = await pub.call('GET', '/api/public/:slug/lead/project', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.project.name, 'Project A');
    assert.equal(res.body.balance.received_cents, 80000);
    const text = JSON.stringify(res.body);
    assert.doesNotMatch(text, /Donor of record/);
    assert.doesNotMatch(text, /9,?999/);
    assert.ok(!('id' in res.body.project));
    const stored = await pool.query('SELECT token_hash FROM org_public_links WHERE id = $1', [l.id]);
    assert.notEqual(stored.rows[0].token_hash, l.token);
    const anywhere = await pool.query(`SELECT count(*)::int AS n FROM org_audit_log WHERE metadata::text LIKE '%' || $1 || '%'`, [l.token]);
    assert.equal(anywhere.rows[0].n, 0);
    const uses = await pool.query('SELECT action FROM org_public_link_uses WHERE link_id = $1', [l.id]);
    assert.deepEqual(uses.rows.map((u) => u.action), ['view']);
  });
});

test('a wrong, revoked or expired link is refused; a link from one workspace does not open another', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, a, staff, pub, asStaff, link } = await setup(pool, asApp);
    const view = (token, slug) => pub.call('GET', '/api/public/:slug/lead/project', { params: { slug: slug || ws.slug }, headers: { 'x-link-token': token } });
    let res = await view('x'.repeat(43));
    assert.equal(res.body.code, 'link_invalid');
    const l = await link(a.id);
    res = await staff.call('POST', P + '/sponsored-projects/:id/lead-links/:linkId/revoke', { ...asStaff(1, a.id), params: { slug: ws.slug, id: String(a.id), linkId: String(l.id) }, body: { reason: 'Lead changed' } });
    assert.equal(res.statusCode, 200);
    res = await view(l.token);
    assert.equal(res.body.code, 'link_revoked');
    const l2 = await link(a.id);
    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_public_links SET expires_at = now() - interval '1 minute' WHERE id = $1`, [l2.id]);
    const other = await h.seedWorkspace(pool);
    await asApp(ws.orgId);
    res = await view(l2.token);
    assert.equal(res.body.code, 'link_expired');
    const l3 = await link(a.id);
    await asApp(other.orgId);
    res = await view(l3.token, other.slug);
    assert.equal(res.body.code, 'link_invalid');
  });
});

test('a single-use sign-in link cannot be used twice', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a } = await setup(pool, asApp);
    const { createSignInLink, checkLink, recordUse } = require('../../server/organizational/lib/publicLinks');
    const l = await createSignInLink(pool, { orgId: ws.orgId, purpose: 'sign_in', projectId: a.id });
    const req = { ip: '127.0.0.1' };
    const first = await checkLink(pool, { orgId: ws.orgId, token: l.token, purpose: 'sign_in' });
    assert.ok(first.link);
    assert.equal(await recordUse(pool, req, first.link, 'sign_in'), true);
    assert.equal(await recordUse(pool, req, first.link, 'sign_in'), false);
    const again = await checkLink(pool, { orgId: ws.orgId, token: l.token, purpose: 'sign_in' });
    assert.equal(again.refusal.body.code, 'link_used');
    const wrongPurpose = await checkLink(pool, { orgId: ws.orgId, token: l.token, purpose: 'project_lead' });
    assert.equal(wrongPurpose.refusal.body.code, 'link_invalid');
  });
});

test('lead forms: honeypot and too-fast submits are refused; a request lands on the link\'s project for staff review', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, pub, link } = await setup(pool, asApp);
    const l = await link(a.id);
    const send = (body) => pub.call('POST', '/api/public/:slug/lead/payment-requests', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token }, body });
    const good = { payee_name: 'Print shop', payee_kind: 'organization', amount_cents: '12000', purpose: 'Flyers', method: 'check' };
    let res = await send({ ...good, ...form(ws), website: 'http://spam.example' });
    assert.equal(res.body.code, 'rejected');
    res = await send({ ...good, form_token: issueFormToken(ws.orgId, Date.now()) });
    assert.equal(res.body.code, 'too_fast');
    res = await send({ ...good });
    assert.equal(res.body.code, 'form_token');
    res = await send({ ...good, ...form(ws) });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const r = await h.one(pool, 'SELECT sponsored_project_id, requester_link_ref, created_by, status FROM org_sponsor_payment_requests WHERE id = $1', [res.body.id]);
    assert.deepEqual([r.sponsored_project_id, r.requester_link_ref, r.created_by, r.status], [a.id, 'link:' + l.id, null, 'submitted']);
    res = await send({ ...good, amount_cents: '99999999', ...form(ws) });
    assert.equal(res.body.code, 'over_balance');
    const staff = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Print shop two', 'organization') RETURNING id`, [ws.orgId]);
    res = await send({ ...good, payee_name: 'Print shop two', ...form(ws) });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const used = await h.one(pool, 'SELECT payee_constituent_id FROM org_sponsor_payment_requests WHERE id = $1', [res.body.id]);
    assert.notEqual(Number(used.payee_constituent_id), Number(staff.id));
  });
});

test('lead uploads: a report marks the quarter received; a document lands on the project; a bad type is refused', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, pub, link } = await setup(pool, asApp);
    const rep = await h.one(pool, `INSERT INTO org_sponsor_reports (org_id, sponsored_project_id, kind, period_start, period_end, due_date) VALUES ($1, $2, 'project_quarterly', '2026-07-01', '2026-09-30', '2026-10-30') RETURNING id`, [ws.orgId, a.id]);
    const l = await link(a.id);
    const file = { buffer: Buffer.from('%PDF report ' + Math.random()), originalname: 'q3.pdf', mimetype: 'application/pdf' };
    let res = await pub.call('POST', '/api/public/:slug/lead/reports/:reportId', { params: { slug: ws.slug, reportId: String(rep.id) }, headers: { 'x-link-token': l.token }, body: form(ws), file });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const got = await h.one(pool, 'SELECT received_at, document_id FROM org_sponsor_reports WHERE id = $1', [rep.id]);
    assert.ok(got.received_at && got.document_id);
    const d = await h.one(pool, 'SELECT sponsored_project_id, sponsor_doc_type FROM org_documents WHERE id = $1', [got.document_id]);
    assert.deepEqual([d.sponsored_project_id, d.sponsor_doc_type], [a.id, 'report']);
    res = await pub.call('POST', '/api/public/:slug/lead/documents', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token },
      body: { ...form(ws), doc_type: 'insurance' }, file: { buffer: Buffer.from('%PDF ins ' + Math.random()), originalname: 'ins.pdf', mimetype: 'application/pdf' } });
    assert.equal(res.statusCode, 201);
    res = await pub.call('POST', '/api/public/:slug/lead/documents', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token },
      body: { ...form(ws), doc_type: 'insurance' }, file: { buffer: Buffer.from('MZ'), originalname: 'x.exe', mimetype: 'application/x-msdownload' } });
    assert.equal(res.body.code, 'bad_file');
  });
});

test('public routes are rate limited by IP', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, pub, link } = await setup(pool, asApp);
    const l = await link(a.id);
    let last;
    for (let i = 0; i < 11; i++) {
      last = await pub.call('POST', '/api/public/:slug/lead/documents', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token }, body: { website: 'bot' }, ip: '10.0.0.9' });
    }
    assert.equal(last.statusCode, 429);
    assert.equal(last.body.code, 'rate_limited');
    const otherIp = await pub.call('POST', '/api/public/:slug/lead/documents', { params: { slug: ws.slug }, headers: { 'x-link-token': l.token }, body: { website: 'bot' }, ip: '10.0.0.10' });
    assert.equal(otherIp.body.code, 'rejected');
  });
});

test('staff: only sponsor staff make links; the public page shows only when turned on', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, a, staff, pub, asStaff } = await setup(pool, asApp);
    await asApp(ws.orgId, [ws.programs.projectA]);
    let res = await staff.call('POST', P + '/sponsored-projects/:id/lead-links', { ...asStaff(3, a.id), body: {} });
    assert.equal(res.statusCode, 403);
    res = await staff.call('POST', P + '/sponsored-projects/:id/lead-links', { ...asStaff(2, a.id), body: {} });
    assert.equal(res.statusCode, 403);
    await asApp(ws.orgId);
    res = await pub.call('GET', '/api/public/:slug/projects/:projectId', { params: { slug: ws.slug, projectId: String(a.id) } });
    assert.equal(res.statusCode, 404);
    await pool.query(`UPDATE org_sponsored_projects SET public_page_enabled = true, public_summary = 'Growing food together.' WHERE id = $1`, [a.id]);
    res = await pub.call('GET', '/api/public/:slug/projects/:projectId', { params: { slug: ws.slug, projectId: String(a.id) } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ['donate_url', 'name', 'summary', 'workspace_name']);
    assert.equal(res.body.donate_url, null);
  });
});
