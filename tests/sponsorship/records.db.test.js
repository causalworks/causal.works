'use strict';

// Sponsorship S3 against a throwaway database: applications, agreements and the fee lock, document types and versions,
// the reports calendar with holds and reminders, acknowledgments and good standing, the approvals queue, compliance items.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug';
process.env.CAUSAL_UPLOADS_ROOT = process.env.CAUSAL_UPLOADS_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-test-'));

async function setup(pool, asApp) {
  const ws = await h.seedWorkspace(pool);
  const project = await h.seedProject(pool, ws);
  const lead = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind, email) VALUES ($1, 'Project lead', 'individual', 'lead@example.test') RETURNING id`, [ws.orgId]);
  await asApp(ws.orgId);
  const r = h.loadRoutes('routes/sponsorshipRecords.js', 'registerSponsorshipRecordRoutes', pool);
  const as = (i, extra) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { slug: ws.slug, id: String(project.id), ...(extra || {}) } });
  return { ws, project, lead, r, as };
}

async function addDoc(pool, ws, project, title, type) {
  return (await h.one(pool,
    `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, sponsored_project_id, sponsor_doc_type)
     VALUES ($1, 'other', $2, 'a.pdf', 'x/a.pdf', 'application/pdf', 1, md5(random()::text), $3, $4) RETURNING id`, [ws.orgId, title, project.id, type || null])).id;
}

test('application: decline needs a reason; accepting creates the project with a fee rule; a second decision is refused', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, lead, r, as } = await setup(pool, asApp);
    let res = await r.call('POST', P + '/sponsor-applications', { ...as(1), body: { project_name: 'Community garden' } });
    assert.match(res.body.error, /project lead/);
    res = await r.call('POST', P + '/sponsor-applications', { ...as(1), body: { project_name: 'Community garden', lead_constituent_id: lead.id, budget_cents: 2500000, mission: 'Grow food' } });
    assert.equal(res.statusCode, 201);
    const appId = String(res.body.application.id);
    res = await r.call('POST', P + '/sponsor-applications/:applicationId/decide', { ...as(3, { applicationId: appId }), body: { decision: 'accept', reason: 'x' } });
    assert.equal(res.statusCode, 403);
    res = await r.call('POST', P + '/sponsor-applications/:applicationId/decide', { ...as(1, { applicationId: appId }), body: { decision: 'decline' } });
    assert.equal(res.body.code, 'reason_required');
    res = await r.call('POST', P + '/sponsor-applications/:applicationId/decide', { ...as(1, { applicationId: appId }), body: { decision: 'accept', reason: 'Board approved on 2026-10-01', program_id: ws.programs.projectB } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const p = await h.one(pool, 'SELECT status, program_id, lead_constituent_id, annual_budget_estimate::float AS b FROM org_sponsored_projects WHERE id = $1', [res.body.sponsored_project_id]);
    assert.deepEqual([p.status, p.program_id, p.lead_constituent_id, p.b], ['accepted', ws.programs.projectB, lead.id, 25000]);
    const rule = await h.one(pool, 'SELECT kind, rate::float AS rate FROM org_sponsor_fee_rules WHERE sponsored_project_id = $1', [res.body.sponsored_project_id]);
    assert.deepEqual([rule.kind, rule.rate], ['percent', 6]);
    res = await r.call('POST', P + '/sponsor-applications/:applicationId/decide', { ...as(1, { applicationId: appId }), body: { decision: 'decline', reason: 'x' } });
    assert.equal(res.body.code, 'already_decided');
  });
});

test('agreement: generated from a template as a project document; signing locks the fee rule; then only amendments', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    const docs = require('../../server/organizational/lib/sponsorDocuments');
    let rendered = '';
    docs.setPdfRenderer(async (html) => { rendered = html; return Buffer.from('%PDF-1.4 test'); });
    try {
      let res = await r.call('GET', P + '/sponsor-agreement-templates', as(1));
      const tpl = res.body.templates.find((t) => t.is_default && t.model === 'model_a');
      res = await r.call('POST', P + '/sponsored-projects/:id/agreements', { ...as(1), body: { template_id: tpl.id, effective_date: '2026-02-01', term_values: { project_purpose: 'Grow food together', term_end: '2028-01-31' } } });
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      assert.match(rendered, /Grow food together/);
      assert.match(rendered, /6 percent of gross receipts/);
      assert.match(rendered, /variance power/i);
      const gen = await h.one(pool, 'SELECT sponsor_doc_type, sponsored_project_id FROM org_documents WHERE id = $1', [res.body.document_id]);
      assert.deepEqual([gen.sponsor_doc_type, gen.sponsored_project_id], ['agreement', project.id]);
      const agreementId = String(res.body.agreement.id);

      res = await r.call('POST', P + '/sponsored-projects/:id/agreements/:agreementId/signed', { ...as(1, { agreementId }), body: { signed_at: '2026-02-03' } });
      assert.match(res.body.error, /Upload the signed copy/);
      const signedDoc = await addDoc(pool, ws, project, 'Signed agreement');
      res = await r.call('POST', P + '/sponsored-projects/:id/agreements/:agreementId/signed', { ...as(1, { agreementId }), body: { signed_at: '2026-02-03', document_id: signedDoc } });
      assert.equal(res.statusCode, 200);
      const p = await h.one(pool, 'SELECT agreement_signed_at::text AS s FROM org_sponsored_projects WHERE id = $1', [project.id]);
      assert.equal(p.s, '2026-02-03');

      const fees = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
      res = await fees.call('POST', P + '/sponsored-projects/:id/fee-rules', { ...as(1), body: { kind: 'percent', rate: 4 } });
      assert.equal(res.body.code, 'amendment_date_required');

      res = await r.call('POST', P + '/sponsored-projects/:id/agreements', { ...as(1), body: { template_id: tpl.id, effective_date: '2026-03-01' } });
      assert.equal(res.body.code, 'agreement_signed');
      res = await r.call('POST', P + '/sponsored-projects/:id/agreements/:agreementId/amendments', { ...as(1, { agreementId }), body: { effective_date: '2026-07-01', summary: 'Lower fee' } });
      assert.match(res.body.error, /Upload the signed amendment/);
      const amendDoc = await addDoc(pool, ws, project, 'Amendment one');
      res = await r.call('POST', P + '/sponsored-projects/:id/agreements/:agreementId/amendments', { ...as(1, { agreementId }), body: { effective_date: '2026-07-01', summary: 'Lower fee', document_id: amendDoc } });
      assert.equal(res.statusCode, 201);
      res = await r.call('GET', P + '/sponsored-projects/:id/agreements', as(2));
      assert.equal(res.body.amendments.length, 1);
      assert.equal(res.body.missing_signed_agreement, false);
    } finally {
      docs.setPdfRenderer(null);
    }
  });
});

test('documents: a type can be set, and a new version keeps its type', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    const docId = await addDoc(pool, ws, project, 'Insurance certificate');
    let res = await r.call('PATCH', P + '/sponsored-projects/:id/documents/:docId', { ...as(1, { docId: String(docId) }), body: { sponsor_doc_type: 'nonsense' } });
    assert.equal(res.statusCode, 400);
    res = await r.call('PATCH', P + '/sponsored-projects/:id/documents/:docId', { ...as(1, { docId: String(docId) }), body: { sponsor_doc_type: 'insurance' } });
    assert.equal(res.statusCode, 200);
    const v2 = await h.one(pool,
      `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, sponsored_project_id, version, supersedes_id)
       VALUES ($1, 'other', 'Insurance certificate', 'b.pdf', 'x/b.pdf', 'application/pdf', 1, 'y', $2, 2, $3) RETURNING sponsor_doc_type`, [ws.orgId, project.id, docId]);
    assert.equal(v2.sponsor_doc_type, 'insurance');
    res = await r.call('GET', P + '/sponsored-projects/:id/documents', as(2));
    assert.equal(res.body.documents.length, 2);
    assert.ok(res.body.types.some((t) => t.key === 'donor_letter'));
  });
});

test('reports calendar: quarterly rows are added once; an overdue report holds the project; receiving it lifts the hold', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET start_date = (CURRENT_DATE - 200) WHERE id = $1`, [project.id]);
    await pool.query(`UPDATE org_sponsor_settings SET created_at = now() - interval '300 days' WHERE org_id = $1`, [ws.orgId]);
    await asApp(ws.orgId);
    const first = await h.one(pool, 'SELECT org_generate_sponsor_quarterly_reports() AS n');
    assert.ok(Number(first.n) >= 2);
    const again = await h.one(pool, 'SELECT org_generate_sponsor_quarterly_reports() AS n');
    assert.equal(Number(again.n), 0);
    let res = await r.call('GET', P + '/sponsored-projects/:id/reports', as(1));
    const late = res.body.reports.filter((x) => x.status === 'overdue');
    assert.ok(late.length >= 1);

    const holds = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    const mine = holds.rows.filter((x) => x.sponsored_project_id === project.id);
    const p = await h.one(pool, 'SELECT status FROM org_sponsored_projects WHERE id = $1', [project.id]);
    const anyLongOverdue = res.body.reports.some((x) => !x.received_at && new Date(x.due_date) < new Date(Date.now() - 30 * 86400000));
    assert.equal(p.status, anyLongOverdue ? 'on_hold' : 'active');
    assert.equal(mine.length, anyLongOverdue ? 1 : 0);

    for (const rep of res.body.reports.filter((x) => !x.received_at && x.status === 'overdue')) {
      const docId = await addDoc(pool, ws, project, 'Report ' + rep.period_end);
      const out = await r.call('POST', P + '/sponsor-reports/:reportId/received', { ...as(1, { reportId: String(rep.id) }), body: { document_id: docId } });
      assert.equal(out.statusCode, 200);
    }
    await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    const after = await h.one(pool, 'SELECT status, last_report_received_at FROM org_sponsored_projects WHERE id = $1', [project.id]);
    assert.equal(after.status, 'active');
    assert.ok(after.last_report_received_at);
    res = await r.call('POST', P + '/sponsor-reports/:reportId/received', { ...as(1, { reportId: String(late[0].id) }), body: {} });
    assert.match(res.body.error, /Attach the report/);
  });
});

test('quarterly reports start from when sponsorship was set up, not from an old project start date', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, project } = await setup(pool, asApp);
    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET start_date = '2020-01-01' WHERE id = $1`, [project.id]);
    await asApp(ws.orgId);
    await pool.query('SELECT org_generate_sponsor_quarterly_reports()');
    const r = await h.one(pool, `SELECT min(period_end)::text AS first, count(*)::int AS n FROM org_sponsor_reports WHERE sponsored_project_id = $1`, [project.id]);
    assert.ok(r.n <= 2, 'only the current quarter or so');
    assert.ok(r.first >= new Date(Date.now() - 100 * 86400000).toISOString().slice(0, 10));
  });
});

test('report reminders: the log row is written first and a rerun sends nothing', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, project, lead } = await setup(pool, asApp);
    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET lead_constituent_id = $1 WHERE id = $2`, [lead.id, project.id]);
    await pool.query(`INSERT INTO org_sponsor_reports (org_id, sponsored_project_id, kind, period_start, period_end, due_date) VALUES ($1, $2, 'project_quarterly', '2026-07-01', '2026-09-30', CURRENT_DATE + 3)`, [ws.orgId, project.id]);
    await asApp(ws.orgId);
    const { sendReportReminders } = require('../../server/organizational/lib/sponsorReports');
    const sent = [];
    const fake = async (m) => { sent.push(m); return true; };
    const first = await sendReportReminders(pool, { send: fake });
    assert.equal(first.sent, 1);
    assert.equal(sent[0].to, 'lead@example.test');
    assert.match(sent[0].subject, /Report due soon/);
    assert.doesNotMatch(sent[0].text, /\bCausal\b/);
    const second = await sendReportReminders(pool, { send: fake });
    assert.equal(second.sent, 0);
    assert.equal(sent.length, 1);
  });
});

test('acknowledgments, good standing and reactivation of a lapsed project', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    let res = await r.call('POST', P + '/sponsored-projects/:id/acknowledgments', { ...as(1), body: { item_key: 'made_up', acknowledged_on: '2026-10-01' } });
    assert.equal(res.statusCode, 400);
    res = await r.call('POST', P + '/sponsored-projects/:id/acknowledgments', { ...as(1), body: { item_key: 'lobbying_political', acknowledged_on: '2026-10-01' } });
    assert.equal(res.statusCode, 201);
    res = await r.call('GET', P + '/sponsored-projects/:id/standing', as(2));
    assert.equal(res.body.standing.items.find((i) => i.key === 'lobbying_ack').ok, true);
    assert.equal(res.body.standing.items.find((i) => i.key === 'agreement').ok, false);
    assert.equal(res.body.standing.acknowledgments.find((a) => a.key === 'lobbying_political').acknowledged_on, '2026-10-01');

    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET status = 'lapsed' WHERE id = $1`, [project.id]);
    await asApp(ws.orgId);
    res = await r.call('POST', P + '/sponsored-projects/:id/reactivate', { ...as(1), body: {} });
    assert.equal(res.body.code, 'not_in_good_standing');
    assert.match(res.body.error, /signed agreement/);
    res = await r.call('POST', P + '/sponsored-projects/:id/reactivate', { ...as(0), body: {} });
    assert.equal(res.body.code, 'not_in_good_standing');
    res = await r.call('POST', P + '/sponsored-projects/:id/reactivate', { ...as(0), body: { reason: 'Agreement signed on paper, upload pending' } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.status, 'active');
  });
});

test('approvals queue: the requester cannot decide; declining needs a reason', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { r, as } = await setup(pool, asApp);
    let res = await r.call('POST', P + '/sponsored-projects/:id/approvals', { ...as(1), body: { kind: 'proposal', title: 'Proposal to a foundation' } });
    assert.equal(res.statusCode, 201);
    const approvalId = String(res.body.id);
    res = await r.call('POST', P + '/sponsor-approvals/:approvalId/decide', { ...as(1, { approvalId }), body: { decision: 'approve' } });
    assert.equal(res.body.code, 'self_approval');
    res = await r.call('POST', P + '/sponsor-approvals/:approvalId/decide', { ...as(4, { approvalId }), body: { decision: 'decline' } });
    assert.equal(res.body.code, 'reason_required');
    res = await r.call('POST', P + '/sponsor-approvals/:approvalId/decide', { ...as(4, { approvalId }), body: { decision: 'approve' } });
    assert.equal(res.body.status, 'approved');
    res = await r.call('GET', P + '/sponsor-approvals', { ...as(2), query: { status: 'approved' } });
    assert.equal(res.body.approvals.length, 1);
  });
});

test('compliance calendar and dashboard show the missing agreement', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project } = await setup(pool, asApp);
    const { complianceItems } = require('../../server/organizational/lib/sponsorReports');
    const items = await complianceItems(pool, ws.orgId, ws.slug);
    assert.ok(items.some((i) => /No signed agreement: Project A/.test(i.title)));
    const { fetchAttentionFeed } = require('../../server/organizational/lib/OrganizationalAttentionFeed');
    const feed = await fetchAttentionFeed(pool, ws.orgId, ws.slug);
    assert.ok((feed.items || feed).some((i) => /has no signed agreement/.test(i.title)));
    void project;
  });
});
