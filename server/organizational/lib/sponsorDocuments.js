'use strict';

// Sponsored-project documents: the project document types, and storing a generated PDF (agreement, statement) as a project document.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { htmlToPdfBuffer } = require('./OrganizationalHtmlPdf');
const { logAudit } = require('./auditLog');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));

const DOC_TYPES = {
  application: { label: 'Application', category: 'other' },
  agreement: { label: 'Agreement', category: 'contract_lease' },
  insurance: { label: 'Insurance', category: 'insurance_certificate' },
  report: { label: 'Report', category: 'sponsee_report' },
  correspondence: { label: 'Correspondence', category: 'other' },
  tax_form: { label: 'Tax form', category: 'vendor_w9' },
  donor_letter: { label: 'Donor letter', category: 'other' },
};

let renderPdf = htmlToPdfBuffer;
function setPdfRenderer(fn) { renderPdf = fn || htmlToPdfBuffer; }

async function storeGeneratedPdf(pool, { orgId, userId, projectId, html, title, filename, docType, documentDate, sourceRefType, sourceRefId }) {
  const pdf = await renderPdf(html);
  const dir = path.join(UPLOADS_ROOT, 'documents', String(orgId), String(new Date().getUTCFullYear()));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'sponsor-' + crypto.randomBytes(12).toString('hex') + '.pdf');
  fs.writeFileSync(filePath, pdf);
  try {
    const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
    const category = (DOC_TYPES[docType] || DOC_TYPES.correspondence).category;
    const r = await pool.query(
      `INSERT INTO org_documents
         (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, document_date,
          retention_class, visibility, sponsored_project_id, sponsor_doc_type, source_ref_type, source_ref_id, uploaded_by_user_id)
       VALUES ($1, $2, $3, $4, $5, 'application/pdf', $6, $7, $8::date, 'fixed_term', 'org_all', $9, $10, $11, $12, $13)
       RETURNING id`,
      [orgId, category, title, filename, path.relative(UPLOADS_ROOT, filePath), pdf.length, checksum, documentDate || null,
       projectId, docType || null, sourceRefType || null, sourceRefId || null, userId || null]);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_documents', recordId: r.rows[0].id, metadata: { generated: docType, sponsored_project_id: projectId } });
    return { id: r.rows[0].id, pdf };
  } catch (e) {
    fs.unlink(filePath, () => {});
    if (e.code === '23505' && e.constraint === 'uq_org_documents_vault_checksum') {
      const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
      const same = await pool.query('SELECT id FROM org_documents WHERE org_id = $1 AND checksum_sha256 = $2 AND archived_at IS NULL AND source_ref_type IS NULL LIMIT 1', [orgId, checksum]);
      if (same.rows.length) return { id: same.rows[0].id, pdf, existing: true };
    }
    throw e;
  }
}

const UPLOAD_TYPES = {
  'application/pdf': '.pdf', 'image/png': '.png', 'image/jpeg': '.jpg', 'text/csv': '.csv',
  'application/msword': '.doc', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

// Stores a file sent through a public lead link as a project document (an identical file already on file is reused).
async function storeUploadedFile(pool, { orgId, projectId, buffer, originalName, mimeType, title, docType, note }) {
  const ext = UPLOAD_TYPES[mimeType];
  if (!ext) return { error: 'Send a PDF, an image, or a Word, Excel or CSV file.' };
  const dir = path.join(UPLOADS_ROOT, 'documents', String(orgId), String(new Date().getUTCFullYear()));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'lead-' + crypto.randomBytes(12).toString('hex') + ext);
  fs.writeFileSync(filePath, buffer);
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const same = await pool.query('SELECT id FROM org_documents WHERE org_id = $1 AND checksum_sha256 = $2 AND archived_at IS NULL AND source_ref_type IS NULL LIMIT 1', [orgId, checksum]);
  if (same.rows.length) { fs.unlink(filePath, () => {}); return { id: same.rows[0].id, existing: true }; }
  try {
    const category = (DOC_TYPES[docType] || DOC_TYPES.correspondence).category;
    const r = await pool.query(
      `INSERT INTO org_documents
         (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, retention_class, visibility, sponsored_project_id, sponsor_doc_type, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'fixed_term', 'org_all', $9, $10, $11) RETURNING id`,
      [orgId, category, String(title || originalName || 'Document').slice(0, 300), String(originalName || 'file' + ext).slice(0, 300), path.relative(UPLOADS_ROOT, filePath),
       mimeType, buffer.length, checksum, projectId, docType || null, note || 'Sent by the project lead through a project link']);
    await logAudit(pool, { orgId, userId: null, action: 'create', tableName: 'org_documents', recordId: r.rows[0].id, metadata: { via: 'project lead link', sponsored_project_id: projectId } });
    return { id: r.rows[0].id };
  } catch (e) {
    fs.unlink(filePath, () => {});
    throw e;
  }
}

async function projectDocument(pool, orgId, projectId, documentId) {
  if (!documentId) return null;
  const r = await pool.query(
    'SELECT id, title, sponsor_doc_type FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3 AND archived_at IS NULL',
    [documentId, orgId, projectId]);
  return r.rows[0] || null;
}

module.exports = { DOC_TYPES, UPLOAD_TYPES, storeGeneratedPdf, storeUploadedFile, setPdfRenderer, projectDocument, UPLOADS_ROOT };
