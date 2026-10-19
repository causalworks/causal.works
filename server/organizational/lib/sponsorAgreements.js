'use strict';

// Sponsorship agreements: merge fields, generating the agreement PDF from a template, recording the signed copy, and amendments.

const { storeGeneratedPdf, projectDocument } = require('./sponsorDocuments');
const { loadOrgDocInfo } = require('./orgLetterhead');
const { logAudit } = require('./auditLog');
const { isoDate } = require('./sponsorFees');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MERGE_FIELDS = ['sponsor_name', 'project_name', 'receiving_entity', 'effective_date', 'project_purpose', 'fee_text', 'report_days', 'notice_days', 'term_end'];

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function money(c) {
  return '$' + (Number(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function feeText(rule) {
  if (!rule) return '6 percent of gross receipts';
  let t;
  if (rule.kind === 'flat') t = money(rule.flat_cents) + ' each quarter';
  else if (rule.kind === 'tiered') {
    t = (rule.tiers || []).map((x) => Number(x.rate) + ' percent' + (x.up_to_cents != null ? ' of gross receipts in a fiscal year up to ' + money(x.up_to_cents) : ' of gross receipts above that')).join(', ');
  } else t = Number(rule.rate) + ' percent of gross receipts';
  if (Number(rule.minimum_quarter_cents) > 0) t += ', with a minimum of ' + money(rule.minimum_quarter_cents) + ' each quarter';
  return t;
}

// Replaces {{field}} with the value; unknown or empty fields become a blank line to fill in by hand.
function renderTemplate(body, values) {
  return String(body || '').replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, key) => {
    const v = values[key];
    return v == null || v === '' ? '____________' : String(v);
  });
}

function agreementHtml(title, text) {
  const paras = String(text).split(/\n{2,}/).map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('\n');
  return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(title) + '</title><style>' +
    'body{font-family:Georgia,serif;font-size:11.5pt;line-height:1.45;color:#111;margin:0;}' +
    'p{margin:0 0 10pt;} p:first-child{font-weight:bold;font-size:13pt;text-align:center;margin-bottom:16pt;}' +
    '</style></head><body>' + paras + '</body></html>';
}

async function mergeValues(pool, { orgId, project, effectiveDate, termValues }) {
  const info = await loadOrgDocInfo(pool, orgId);
  const rule = (await pool.query(
    `SELECT * FROM org_sponsor_fee_rules WHERE org_id = $1 AND sponsored_project_id = $2 AND effective_from <= $3::date
      ORDER BY effective_from DESC LIMIT 1`, [orgId, project.id, effectiveDate])).rows[0]
    || (await pool.query('SELECT * FROM org_sponsor_fee_rules WHERE org_id = $1 AND sponsored_project_id = $2 ORDER BY effective_from LIMIT 1', [orgId, project.id])).rows[0];
  let entity = null;
  if (project.receiving_constituent_id) {
    const e = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1 AND org_id = $2', [project.receiving_constituent_id, orgId]);
    entity = e.rows[0] ? e.rows[0].display_name : null;
  }
  const t = termValues || {};
  return {
    sponsor_name: info.name,
    project_name: project.name,
    receiving_entity: entity,
    effective_date: effectiveDate,
    project_purpose: t.project_purpose || project.description || null,
    fee_text: feeText(rule),
    report_days: t.report_days || 30,
    notice_days: t.notice_days || 30,
    term_end: t.term_end || null,
  };
}

async function generateAgreement(pool, { orgId, userId, projectId, templateId, effectiveDate, termValues }) {
  if (!effectiveDate || !DATE_RE.test(effectiveDate)) return { httpStatus: 400, body: { error: 'Enter the date the agreement takes effect.' } };
  const p = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  const project = p.rows[0];
  if (!project) return { httpStatus: 404, body: { error: 'Sponsored project not found' } };
  const signed = await pool.query('SELECT 1 FROM org_sponsor_agreements WHERE sponsored_project_id = $1 AND org_id = $2 AND signed_at IS NOT NULL LIMIT 1', [projectId, orgId]);
  if (signed.rows.length) return { httpStatus: 409, body: { code: 'agreement_signed', error: 'This project already has a signed agreement. Record changes as an amendment.' } };
  const t = await pool.query('SELECT * FROM org_sponsor_agreement_templates WHERE id = $1 AND (org_id = $2 OR org_id IS NULL) AND archived_at IS NULL', [templateId, orgId]);
  const template = t.rows[0];
  if (!template) return { httpStatus: 400, body: { error: 'Choose an agreement template.' } };
  const clean = {};
  for (const k of ['project_purpose', 'report_days', 'notice_days', 'term_end']) {
    if (termValues && termValues[k] != null && termValues[k] !== '') clean[k] = String(termValues[k]).slice(0, 2000);
  }
  const values = await mergeValues(pool, { orgId, project, effectiveDate, termValues: clean });
  const text = renderTemplate(template.body, values);
  const doc = await storeGeneratedPdf(pool, {
    orgId, userId, projectId, html: agreementHtml(template.title, text), title: template.title + ': ' + project.name,
    filename: 'agreement-' + project.id + '-' + effectiveDate + '.pdf', docType: 'agreement', documentDate: effectiveDate,
  });
  const ins = await pool.query(
    `INSERT INTO org_sponsor_agreements (org_id, sponsored_project_id, template_id, effective_date, term_values, generated_document_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [orgId, projectId, template.id, effectiveDate, JSON.stringify(clean), doc.id, userId]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_agreements', recordId: ins.rows[0].id, metadata: { sponsored_project_id: projectId, template_id: template.id } });
  return { httpStatus: 201, body: { agreement: ins.rows[0], document_id: doc.id } };
}

async function recordSigned(pool, { orgId, userId, projectId, agreementId, documentId, signedAt }) {
  if (!signedAt || !DATE_RE.test(signedAt)) return { httpStatus: 400, body: { error: 'Enter the date the agreement was signed.' } };
  const a = await pool.query('SELECT * FROM org_sponsor_agreements WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [agreementId, orgId, projectId]);
  if (!a.rows.length) return { httpStatus: 404, body: { error: 'Agreement not found' } };
  if (a.rows[0].signed_at) return { httpStatus: 409, body: { code: 'agreement_signed', error: 'This agreement is already recorded as signed.' } };
  const doc = await projectDocument(pool, orgId, projectId, documentId);
  if (!doc) return { httpStatus: 400, body: { error: 'Upload the signed copy to this project first, then choose it here.' } };
  await pool.query('UPDATE org_sponsor_agreements SET signed_document_id = $1, signed_at = $2 WHERE id = $3', [doc.id, signedAt, agreementId]);
  await pool.query(`UPDATE org_documents SET sponsor_doc_type = 'agreement' WHERE id = $1 AND org_id = $2 AND sponsor_doc_type IS NULL`, [doc.id, orgId]);
  await pool.query(
    `UPDATE org_sponsored_projects SET agreement_signed_at = LEAST(COALESCE(agreement_signed_at, $1::date), $1::date), updated_at = now()
      WHERE id = $2 AND sponsor_org_id = $3`, [signedAt, projectId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_agreements', recordId: agreementId,
    fields: [{ fieldName: 'signed', oldValue: null, newValue: signedAt }], metadata: { signed_document_id: doc.id } });
  return { httpStatus: 200, body: { id: agreementId, signed_at: signedAt } };
}

async function addAmendment(pool, { orgId, userId, projectId, agreementId, effectiveDate, summary, documentId }) {
  const s = String(summary || '').trim();
  if (!effectiveDate || !DATE_RE.test(effectiveDate)) return { httpStatus: 400, body: { error: 'Enter the date the amendment takes effect.' } };
  if (!s) return { httpStatus: 400, body: { error: 'Say what the amendment changes.' } };
  const a = await pool.query('SELECT * FROM org_sponsor_agreements WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [agreementId, orgId, projectId]);
  if (!a.rows.length) return { httpStatus: 404, body: { error: 'Agreement not found' } };
  if (!a.rows[0].signed_at) return { httpStatus: 409, body: { error: 'The agreement is not signed yet. Change it and generate it again instead.' } };
  const doc = await projectDocument(pool, orgId, projectId, documentId);
  if (!doc) return { httpStatus: 400, body: { error: 'Upload the signed amendment to this project first, then choose it here.' } };
  const r = await pool.query(
    `INSERT INTO org_sponsor_agreement_amendments (org_id, sponsored_project_id, agreement_id, effective_date, summary, document_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, [orgId, projectId, agreementId, effectiveDate, s, doc.id, userId]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_agreement_amendments', recordId: r.rows[0].id, metadata: { agreement_id: agreementId, summary: s } });
  return { httpStatus: 201, body: { amendment: { ...r.rows[0], effective_date: isoDate(r.rows[0].effective_date) } } };
}

module.exports = { MERGE_FIELDS, feeText, renderTemplate, agreementHtml, generateAgreement, recordSigned, addAmendment };
