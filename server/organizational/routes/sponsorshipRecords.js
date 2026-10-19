'use strict';

// Sponsorship records: applications and decisions, agreement templates, agreements and amendments, project documents by type,
// the reports calendar, standing-term acknowledgments, good standing and reactivation, and the approvals queue.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { requireWriteAccess, requireReadAccess, leadMayTouch } = require('../middleware/requireWriteAccess');
const { logAudit } = require('../lib/auditLog');
const { requireFiscalSponsor } = require('./sponsorship');
const { DOC_TYPES } = require('../lib/sponsorDocuments');
const { generateAgreement, recordSigned, addAmendment, MERGE_FIELDS } = require('../lib/sponsorAgreements');
const { calendar, addFunderReport, markReceived } = require('../lib/sponsorReports');
const { loadStanding, recordAcknowledgment, reactivate, ACK_ITEMS } = require('../lib/sponsorStanding');
const { createApplication, decideApplication } = require('../lib/sponsorIntake');
const { isoDate } = require('../lib/sponsorFees');
const { generateStatement, yearEndSheet, yearEndCsv } = require('../lib/sponsorStatements');
const { donorLetters, donorLetterTemplate, attachDonorLetter, createPropertyRelease } = require('../lib/sponsorGifts');
const { loadOrgDocInfo } = require('../lib/orgLetterhead');

const APPROVAL_KINDS = ['letter_of_inquiry', 'proposal', 'pledge', 'agreement', 'solicitation', 'publicity'];

function posInt(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function uid(req) { return req.user.user_id ?? req.user.id; }

function notProgramLead(req, res, next) {
  if (req.coopOrgRole !== 'program') return next();
  return res.status(403).json({ code: 'sponsor_staff_only', error: 'This is for the sponsor\'s staff. Ask an admin if you need access.' });
}

function registerSponsorshipRecordRoutes(app, pool) {
  const auth = requireAuth(pool);
  const base = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireFiscalSponsor(pool)];
  const read = [...base, requireReadAccess('sponsorship'), boardSeesAllPrograms];
  const staffRead = [...read, notProgramLead];
  const projectWrite = [...base, requireWriteAccess('sponsorship')];
  const staffWrite = [...projectWrite, notProgramLead];
  const P = '/api/organizational/orgs/:slug';

  async function projectOr404(req, res) {
    const id = posInt(req.params.id);
    if (!id) { res.status(400).json({ error: 'Invalid sponsored project ID' }); return null; }
    const r = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [id, req.orgId]);
    if (!r.rows.length) { res.status(404).json({ error: 'Sponsored project not found' }); return null; }
    if (!leadMayTouch(req, [r.rows[0].program_id])) { res.status(404).json({ error: 'Sponsored project not found' }); return null; }
    return r.rows[0];
  }

  function wrap(label, fn) {
    return async (req, res) => {
      try {
        const out = await fn(req, res);
        if (out && !res.headersSent) return res.status(out.httpStatus).json(out.body);
        return undefined;
      } catch (e) {
        console.error(label + ':', e.message);
        if (!res.headersSent) return res.status(500).json({ error: 'Something went wrong. Try again, and tell an admin if it keeps happening.' });
        return undefined;
      }
    };
  }

  // Applications
  app.get(P + '/sponsor-applications', ...staffRead, wrap('GET /sponsor-applications', async (req) => {
    const r = await pool.query(
      `SELECT a.id, a.project_name, a.mission, a.activities, a.budget_cents, a.leaders, a.expected_funders, a.risks, a.status, a.source,
              a.created_at, a.decided_at, a.decision_reason, a.sponsored_project_id, a.applicant_constituent_id, a.lead_constituent_id,
              ac.display_name AS applicant_name, lc.display_name AS lead_name
         FROM org_sponsor_applications a
         LEFT JOIN org_constituents ac ON ac.id = a.applicant_constituent_id
         LEFT JOIN org_constituents lc ON lc.id = a.lead_constituent_id
        WHERE a.org_id = $1 ORDER BY (a.status IN ('submitted', 'in_review')) DESC, a.created_at DESC`, [req.orgId]);
    return { httpStatus: 200, body: { applications: r.rows.map((x) => ({ ...x, budget_cents: x.budget_cents != null ? Number(x.budget_cents) : null })) } };
  }));

  app.post(P + '/sponsor-applications', ...staffWrite, wrap('POST /sponsor-applications', (req) =>
    createApplication(pool, { orgId: req.orgId, userId: uid(req), input: req.body || {}, source: 'staff' })));

  app.post(P + '/sponsor-applications/:applicationId/decide', ...staffWrite, wrap('POST /sponsor-applications/:id/decide', (req) => {
    const id = posInt(req.params.applicationId);
    if (!id) return { httpStatus: 400, body: { error: 'Invalid application ID' } };
    const b = req.body || {};
    return decideApplication(pool, { orgId: req.orgId, userId: uid(req), applicationId: id, decision: String(b.decision || ''), reason: b.reason, programId: b.program_id, model: b.sponsorship_model });
  }));

  // Agreement templates
  app.get(P + '/sponsor-agreement-templates', ...read, wrap('GET /sponsor-agreement-templates', async (req) => {
    const r = await pool.query(
      `SELECT id, org_id IS NULL AS is_default, model, title, body, updated_at FROM org_sponsor_agreement_templates
        WHERE (org_id = $1 OR org_id IS NULL) AND archived_at IS NULL ORDER BY (org_id IS NULL), title`, [req.orgId]);
    return { httpStatus: 200, body: { templates: r.rows, merge_fields: MERGE_FIELDS } };
  }));

  app.post(P + '/sponsor-agreement-templates', ...staffWrite, wrap('POST /sponsor-agreement-templates', async (req) => {
    const b = req.body || {};
    const title = String(b.title || '').trim();
    const body = String(b.body || '').trim();
    if (!title || !body) return { httpStatus: 400, body: { error: 'A template needs a title and its text.' } };
    if (b.model != null && b.model !== '' && !['model_a', 'model_c', 'other'].includes(b.model)) return { httpStatus: 400, body: { error: 'Choose a sponsorship model, or leave it for any model.' } };
    const r = await pool.query(
      `INSERT INTO org_sponsor_agreement_templates (org_id, model, title, body, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [req.orgId, b.model || null, title, body, uid(req)]);
    await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'create', tableName: 'org_sponsor_agreement_templates', recordId: r.rows[0].id, metadata: { title } });
    return { httpStatus: 201, body: { id: r.rows[0].id } };
  }));

  app.put(P + '/sponsor-agreement-templates/:templateId', ...staffWrite, wrap('PUT /sponsor-agreement-templates/:id', async (req) => {
    const id = posInt(req.params.templateId);
    const b = req.body || {};
    const cur = await pool.query('SELECT * FROM org_sponsor_agreement_templates WHERE id = $1 AND org_id = $2', [id, req.orgId]);
    if (!cur.rows.length) return { httpStatus: 404, body: { error: 'Template not found. A shared default cannot be changed; save a copy instead.' } };
    const title = b.title != null ? String(b.title).trim() : cur.rows[0].title;
    const body = b.body != null ? String(b.body).trim() : cur.rows[0].body;
    if (!title || !body) return { httpStatus: 400, body: { error: 'A template needs a title and its text.' } };
    await pool.query(`UPDATE org_sponsor_agreement_templates SET title = $1, body = $2, archived_at = CASE WHEN $3 THEN now() ELSE NULL END, updated_at = now() WHERE id = $4`,
      [title, body, !!b.archived, id]);
    const fields = [];
    if (title !== cur.rows[0].title) fields.push({ fieldName: 'title', oldValue: cur.rows[0].title, newValue: title });
    if (body !== cur.rows[0].body) fields.push({ fieldName: 'body', oldValue: '(previous text)', newValue: '(new text)' });
    if (!!b.archived !== !!cur.rows[0].archived_at) fields.push({ fieldName: 'archived', oldValue: cur.rows[0].archived_at ? 'yes' : 'no', newValue: b.archived ? 'yes' : 'no' });
    if (fields.length) await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_sponsor_agreement_templates', recordId: id, fields });
    return { httpStatus: 200, body: { id } };
  }));

  // Agreements
  app.get(P + '/sponsored-projects/:id/agreements', ...read, wrap('GET .../agreements', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const [a, m] = await Promise.all([
      pool.query(
        `SELECT a.id, a.template_id, t.title AS template_title, a.effective_date::text AS effective_date, a.term_values, a.generated_document_id,
                a.signed_document_id, a.signed_at::text AS signed_at, a.created_at
           FROM org_sponsor_agreements a LEFT JOIN org_sponsor_agreement_templates t ON t.id = a.template_id
          WHERE a.org_id = $1 AND a.sponsored_project_id = $2 ORDER BY a.created_at DESC`, [req.orgId, project.id]),
      pool.query(
        `SELECT id, agreement_id, effective_date::text AS effective_date, summary, document_id, created_at FROM org_sponsor_agreement_amendments
          WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY effective_date`, [req.orgId, project.id]),
    ]);
    return { httpStatus: 200, body: { agreements: a.rows, amendments: m.rows, missing_signed_agreement: !project.agreement_signed_at } };
  }));

  app.post(P + '/sponsored-projects/:id/agreements', ...staffWrite, wrap('POST .../agreements', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return generateAgreement(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, templateId: posInt(b.template_id), effectiveDate: b.effective_date ? String(b.effective_date) : null, termValues: b.term_values || {} });
  }));

  app.post(P + '/sponsored-projects/:id/agreements/:agreementId/signed', ...staffWrite, wrap('POST .../agreements/:id/signed', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return recordSigned(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, agreementId: posInt(req.params.agreementId), documentId: posInt(b.document_id), signedAt: b.signed_at ? String(b.signed_at) : null });
  }));

  app.post(P + '/sponsored-projects/:id/agreements/:agreementId/amendments', ...staffWrite, wrap('POST .../amendments', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return addAmendment(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, agreementId: posInt(req.params.agreementId), effectiveDate: b.effective_date ? String(b.effective_date) : null, summary: b.summary, documentId: posInt(b.document_id) });
  }));

  // Project documents by type, with versions
  app.get(P + '/sponsored-projects/:id/documents', ...read, wrap('GET .../sponsored-projects/:id/documents', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const r = await pool.query(
      `SELECT id, title, sponsor_doc_type, category::text AS category, version, supersedes_id, is_current, document_date::text AS document_date, created_at, original_filename
         FROM org_documents WHERE org_id = $1 AND sponsored_project_id = $2 AND archived_at IS NULL ORDER BY title, version DESC`, [req.orgId, project.id]);
    return { httpStatus: 200, body: { documents: r.rows, types: Object.entries(DOC_TYPES).map(([key, v]) => ({ key, label: v.label, category: v.category })) } };
  }));

  app.patch(P + '/sponsored-projects/:id/documents/:docId', ...projectWrite, wrap('PATCH .../sponsored-projects/:id/documents/:docId', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const docId = posInt(req.params.docId);
    const type = req.body && req.body.sponsor_doc_type ? String(req.body.sponsor_doc_type) : null;
    if (type && !DOC_TYPES[type]) return { httpStatus: 400, body: { error: 'Choose a document type from the list.' } };
    const d = await pool.query('SELECT sponsor_doc_type FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [docId, req.orgId, project.id]);
    if (!d.rows.length) return { httpStatus: 404, body: { error: 'Document not found on this project' } };
    await pool.query('UPDATE org_documents SET sponsor_doc_type = $1, updated_at = now() WHERE id = $2 AND org_id = $3', [type, docId, req.orgId]);
    await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_documents', recordId: docId, fields: [{ fieldName: 'document type', oldValue: d.rows[0].sponsor_doc_type, newValue: type }] });
    return { httpStatus: 200, body: { id: docId, sponsor_doc_type: type } };
  }));

  // Reports calendar
  app.get(P + '/sponsor-reports/calendar', ...staffRead, wrap('GET /sponsor-reports/calendar', async (req) => ({ httpStatus: 200, body: { reports: await calendar(pool, req.orgId) } })));

  app.get(P + '/sponsored-projects/:id/reports', ...read, wrap('GET .../reports', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return { httpStatus: 200, body: { reports: await calendar(pool, req.orgId, { projectId: project.id }) } };
  }));

  app.post(P + '/sponsored-projects/:id/reports', ...staffWrite, wrap('POST .../reports', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return addFunderReport(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, input: req.body || {} });
  }));

  app.post(P + '/sponsor-reports/:reportId/received', ...staffWrite, wrap('POST /sponsor-reports/:id/received', (req) => {
    const b = req.body || {};
    return markReceived(pool, { orgId: req.orgId, userId: uid(req), reportId: posInt(req.params.reportId), receivedAt: b.received_at ? String(b.received_at) : null, documentId: posInt(b.document_id) });
  }));

  // Standing terms and good standing
  app.get(P + '/sponsored-projects/:id/standing', ...read, wrap('GET .../standing', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return { httpStatus: 200, body: { standing: await loadStanding(pool, req.orgId, project.id), items: ACK_ITEMS } };
  }));

  app.post(P + '/sponsored-projects/:id/acknowledgments', ...staffWrite, wrap('POST .../acknowledgments', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return recordAcknowledgment(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, itemKey: String(b.item_key || ''), acknowledgedOn: b.acknowledged_on ? String(b.acknowledged_on) : null, documentId: posInt(b.document_id), note: b.note });
  }));

  app.post(P + '/sponsored-projects/:id/reactivate', ...staffWrite, wrap('POST .../reactivate', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return reactivate(pool, { orgId: req.orgId, userId: uid(req), role: req.coopOrgRole, projectId: project.id, reason: req.body && req.body.reason });
  }));

  // Statements and year end
  app.get(P + '/sponsored-projects/:id/statements', ...read, wrap('GET .../statements', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const r = await pool.query(
      `SELECT id, month::text AS month, opening_cents, income_cents, fees_cents, expenses_cents, closing_cents, generated_document_id, send_status, sent_at, sent_to
         FROM org_sponsor_statements WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY month DESC LIMIT 36`, [req.orgId, project.id]);
    const n = (v) => (v == null ? null : Number(v));
    return { httpStatus: 200, body: { statements: r.rows.map((x) => ({ ...x, opening_cents: n(x.opening_cents), income_cents: n(x.income_cents), fees_cents: n(x.fees_cents), expenses_cents: n(x.expenses_cents), closing_cents: n(x.closing_cents) })) } };
  }));

  app.post(P + '/sponsored-projects/:id/statements', ...staffWrite, wrap('POST .../statements', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return generateStatement(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, month: String(b.month || ''), send: !!b.send });
  }));

  app.get(P + '/sponsor-reports/year-end', ...staffRead, wrap('GET /sponsor-reports/year-end', async (req, res) => {
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) return { httpStatus: 400, body: { error: 'Choose the fiscal year.' } };
    const sheet = await yearEndSheet(pool, req.orgId, fy);
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sponsored-projects-' + fy + '.csv"');
      res.send(yearEndCsv(sheet));
      return null;
    }
    return { httpStatus: 200, body: sheet };
  }));

  // Donor letters and donated property
  app.get(P + '/sponsored-projects/:id/donor-letters', ...read, wrap('GET .../donor-letters', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return { httpStatus: 200, body: await donorLetters(pool, req.orgId, project.id) };
  }));

  app.get(P + '/sponsored-projects/:id/gifts/:giftId/donor-letter-template', ...read, wrap('GET .../donor-letter-template', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const g = await pool.query(
      `SELECT g.amount_cents, g.received_at::date::text AS d, g.payment_method::text AS m, c.display_name FROM org_gifts g
         LEFT JOIN org_constituents c ON c.id = g.constituent_id WHERE g.id = $1 AND g.org_id = $2 AND g.sponsored_project_id = $3`,
      [posInt(req.params.giftId), req.orgId, project.id]);
    if (!g.rows.length) return { httpStatus: 404, body: { error: 'That gift is not tagged to this project.' } };
    const info = await loadOrgDocInfo(pool, req.orgId);
    const x = g.rows[0];
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="letter-of-gift-' + req.params.giftId + '.txt"');
    res.send(donorLetterTemplate({ sponsorName: info.name, projectName: project.name, donorName: x.display_name, amountCents: x.amount_cents, date: x.d, method: ['check', 'ach', 'wire'].includes(x.m) ? x.m : 'check' }));
    return null;
  }));

  app.post(P + '/sponsored-projects/:id/gifts/:giftId/donor-letter', ...staffWrite, wrap('POST .../donor-letter', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    return attachDonorLetter(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, giftId: posInt(req.params.giftId), documentId: posInt(req.body && req.body.document_id) });
  }));

  app.get(P + '/sponsored-projects/:id/property', ...read, wrap('GET .../property', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const r = await pool.query(
      `SELECT g.id, g.amount_cents, g.received_at::date::text AS received_at, g.in_kind_description, g.posting_status, a.type::text AS held_as,
              d.id AS release_id, d.status AS release_status, d.ledger_transaction_id AS release_posted
         FROM org_gifts g LEFT JOIN org_accounts a ON a.id = g.in_kind_expense_account_id
         LEFT JOIN org_sponsored_project_disbursements d ON d.property_gift_id = g.id AND d.status <> 'void'
        WHERE g.org_id = $1 AND g.sponsored_project_id = $2 AND g.payment_method = 'in_kind' AND g.posting_status <> 'void'
        ORDER BY g.received_at DESC`, [req.orgId, project.id]);
    return { httpStatus: 200, body: { items: r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })) } };
  }));

  app.post(P + '/sponsored-projects/:id/property-releases', ...staffWrite, wrap('POST .../property-releases', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    return createPropertyRelease(pool, { orgId: req.orgId, userId: uid(req), projectId: project.id, giftId: posInt(b.gift_id), releaseDate: b.release_date, notes: b.notes });
  }));

  // Approvals queue (items that use the sponsor's name)
  app.get(P + '/sponsor-approvals', ...read, wrap('GET /sponsor-approvals', async (req) => {
    const status = ['pending', 'approved', 'declined'].includes(String(req.query.status)) ? String(req.query.status) : null;
    const r = await pool.query(
      `SELECT a.id, a.sponsored_project_id, p.name AS project_name, a.kind, a.title, a.funder_constituent_id, c.display_name AS funder_name,
              a.draft_document_id, a.status, a.requested_at, a.decided_at, a.decision_reason, a.signed_document_id
         FROM org_sponsor_approvals a JOIN org_sponsored_projects p ON p.id = a.sponsored_project_id
         LEFT JOIN org_constituents c ON c.id = a.funder_constituent_id
        WHERE a.org_id = $1 ${status ? 'AND a.status = $2' : ''} ORDER BY (a.status = 'pending') DESC, a.requested_at DESC LIMIT 300`, status ? [req.orgId, status] : [req.orgId]);
    return { httpStatus: 200, body: { approvals: r.rows } };
  }));

  app.post(P + '/sponsored-projects/:id/approvals', ...projectWrite, wrap('POST .../approvals', async (req, res) => {
    const project = await projectOr404(req, res);
    if (!project) return null;
    const b = req.body || {};
    const title = String(b.title || '').trim();
    if (!APPROVAL_KINDS.includes(b.kind)) return { httpStatus: 400, body: { error: 'Choose what needs approval: letter of inquiry, proposal, pledge, agreement, solicitation or publicity.' } };
    if (!title) return { httpStatus: 400, body: { error: 'Give it a title (for example, the funder and amount).' } };
    let draft = null;
    if (b.draft_document_id) {
      const d = await pool.query('SELECT id FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [posInt(b.draft_document_id), req.orgId, project.id]);
      if (!d.rows.length) return { httpStatus: 400, body: { error: 'Attach the draft to this project first, then choose it here.' } };
      draft = d.rows[0].id;
    }
    const r = await pool.query(
      `INSERT INTO org_sponsor_approvals (org_id, sponsored_project_id, kind, title, funder_constituent_id, draft_document_id, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [req.orgId, project.id, b.kind, title, posInt(b.funder_constituent_id), draft, uid(req)]);
    await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'create', tableName: 'org_sponsor_approvals', recordId: r.rows[0].id, metadata: { kind: b.kind, title } });
    return { httpStatus: 201, body: { id: r.rows[0].id } };
  }));

  app.post(P + '/sponsor-approvals/:approvalId/decide', ...staffWrite, wrap('POST /sponsor-approvals/:id/decide', async (req) => {
    const id = posInt(req.params.approvalId);
    const b = req.body || {};
    const a = await pool.query('SELECT * FROM org_sponsor_approvals WHERE id = $1 AND org_id = $2', [id, req.orgId]);
    const row = a.rows[0];
    if (!row) return { httpStatus: 404, body: { error: 'Approval request not found' } };
    if (row.status !== 'pending') return { httpStatus: 409, body: { error: 'This is already ' + row.status + '.' } };
    if (row.requested_by != null && Number(row.requested_by) === Number(uid(req))) return { httpStatus: 403, body: { code: 'self_approval', error: 'A different person must decide on something you asked to have approved.' } };
    const decision = b.decision === 'approve' ? 'approved' : b.decision === 'decline' ? 'declined' : null;
    if (!decision) return { httpStatus: 400, body: { error: 'Choose approve or decline.' } };
    const why = String(b.reason || '').trim();
    if (decision === 'declined' && !why) return { httpStatus: 400, body: { code: 'reason_required', error: 'Enter the reason for declining.' } };
    let signed = null;
    if (b.signed_document_id) {
      const d = await pool.query('SELECT id FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [posInt(b.signed_document_id), req.orgId, row.sponsored_project_id]);
      if (!d.rows.length) return { httpStatus: 400, body: { error: 'Attach the signed copy to the project first, then choose it here.' } };
      signed = d.rows[0].id;
    }
    await pool.query(`UPDATE org_sponsor_approvals SET status = $1, decided_by = $2, decided_at = now(), decision_reason = $3, signed_document_id = COALESCE($4, signed_document_id) WHERE id = $5`,
      [decision, uid(req), why || null, signed, id]);
    await logAudit(pool, { orgId: req.orgId, userId: uid(req), action: 'update', tableName: 'org_sponsor_approvals', recordId: id, fields: [{ fieldName: 'status', oldValue: 'pending', newValue: decision }], metadata: { reason: why || null } });
    return { httpStatus: 200, body: { id, status: decision, decided_at: isoDate(new Date()) } };
  }));
}

module.exports = { registerSponsorshipRecordRoutes };
