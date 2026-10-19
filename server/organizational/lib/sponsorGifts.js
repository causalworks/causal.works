'use strict';

// Gifts to sponsored projects: donor letters required for large checks, transfers and wires; receipt wording naming the
// sponsor as the recipient and the project as the purpose; and releasing donated property to a project as a grant at value.

const { loadSponsorSettings } = require('./sponsorBalance');
const { projectDocument } = require('./sponsorDocuments');
const { logAudit } = require('./auditLog');
const { isoDate } = require('./sponsorFees');

const LETTER_METHODS = ['check', 'ach', 'wire'];
const DEFAULT_LETTER_THRESHOLD = 500000;

function money(c) {
  return '$' + (Number(c) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function needsDonorLetter(gift, thresholdCents) {
  return gift.sponsored_project_id != null && LETTER_METHODS.includes(gift.payment_method)
    && Number(gift.amount_cents) > Number(thresholdCents) && gift.posting_status !== 'void';
}

async function donorLetters(pool, orgId, projectId) {
  const s = await loadSponsorSettings(pool, orgId);
  const threshold = s ? Number(s.donor_letter_threshold_cents) : DEFAULT_LETTER_THRESHOLD;
  const r = await pool.query(
    `SELECT g.id, g.amount_cents, g.received_at::date::text AS received_at, g.payment_method::text AS payment_method, g.donor_letter_document_id,
            g.sponsored_project_id, g.posting_status, c.display_name AS donor_name
       FROM org_gifts g LEFT JOIN org_constituents c ON c.id = g.constituent_id
      WHERE g.org_id = $1 AND g.sponsored_project_id = $2 AND g.review_status <> 'dismissed' AND g.posting_status <> 'void'
        AND g.payment_method::text = ANY($3) AND g.amount_cents > $4
      ORDER BY g.received_at DESC`, [orgId, projectId, LETTER_METHODS, threshold]);
  return { threshold_cents: threshold, gifts: r.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), missing: !x.donor_letter_document_id })) };
}

function donorLetterTemplate({ sponsorName, projectName, donorName, amountCents, date, method }) {
  return [
    'Letter of gift',
    '',
    'To: ' + sponsorName,
    'From: ' + (donorName || '______________________'),
    'Date: ______________',
    '',
    'I am making a gift of ' + money(amountCents) + ' by ' + ({ check: 'check', ach: 'bank transfer', wire: 'wire' })[method] + ' on ' + date + ' to ' + sponsorName + '.',
    '',
    'I understand that the gift is to ' + sponsorName + ', which holds it as fiscal sponsor. I would like it to be used for the purposes of ' + projectName + '.',
    'I understand that ' + sponsorName + ' has full control of the gift and may use it for another charitable purpose if the project cannot use it.',
    'The gift is not made for the benefit of any particular person, and I have received no goods or services in return.',
    '',
    'Signed: ______________________',
    '',
  ].join('\n');
}

async function attachDonorLetter(pool, { orgId, userId, projectId, giftId, documentId }) {
  const g = await pool.query('SELECT id, donor_letter_document_id FROM org_gifts WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [giftId, orgId, projectId]);
  if (!g.rows.length) return { httpStatus: 404, body: { error: 'That gift is not tagged to this project.' } };
  const doc = await projectDocument(pool, orgId, projectId, documentId);
  if (!doc) return { httpStatus: 400, body: { error: 'Upload the signed letter to this project first, then choose it here.' } };
  await pool.query('UPDATE org_gifts SET donor_letter_document_id = $1 WHERE id = $2 AND org_id = $3', [doc.id, giftId, orgId]);
  await pool.query(`UPDATE org_documents SET sponsor_doc_type = 'donor_letter' WHERE id = $1 AND org_id = $2 AND sponsor_doc_type IS NULL`, [doc.id, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
    fields: [{ fieldName: 'donor letter', oldValue: g.rows[0].donor_letter_document_id, newValue: doc.id }] });
  return { httpStatus: 200, body: { id: giftId, donor_letter_document_id: doc.id } };
}

// Lines added to a gift acknowledgment when the gift is for a sponsored project.
function sponsoredReceiptLines({ sponsorName, projectName, inKind, description }) {
  const lines = [];
  if (inKind) {
    lines.push(sponsorName + ' received your donation of ' + (description || 'goods or property') + '.');
    lines.push('This receipt describes the donation but does not state its value; valuing a noncash gift is the donor\'s responsibility.');
  }
  lines.push('This gift was made to ' + sponsorName + ', which holds it as fiscal sponsor for ' + projectName + ' and has full control over its use for that charitable purpose.');
  return lines;
}

async function sponsoredReceiptInfo(pool, gift) {
  if (!gift || gift.sponsored_project_id == null) return null;
  const p = await pool.query('SELECT name FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [gift.sponsored_project_id, gift.org_id]);
  if (!p.rows.length) return null;
  return { projectName: p.rows[0].name, inKind: gift.payment_method === 'in_kind', description: gift.in_kind_description || null };
}

// Releasing donated property (an in-kind gift kept as an asset) to the project as a grant at its recorded value.
async function createPropertyRelease(pool, { orgId, userId, projectId, giftId, releaseDate, notes }) {
  const date = releaseDate ? String(releaseDate) : new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { httpStatus: 400, body: { error: 'Enter the release date.' } };
  const g = await pool.query(
    `SELECT g.*, a.type::text AS held_account_type FROM org_gifts g LEFT JOIN org_accounts a ON a.id = g.in_kind_expense_account_id
      WHERE g.id = $1 AND g.org_id = $2`, [giftId, orgId]);
  const gift = g.rows[0];
  if (!gift || Number(gift.sponsored_project_id) !== Number(projectId)) return { httpStatus: 404, body: { error: 'That gift is not tagged to this project.' } };
  if (gift.payment_method !== 'in_kind') return { httpStatus: 400, body: { error: 'Only a donated item (an in-kind gift) can be released as property.' } };
  if (gift.posting_status !== 'posted') return { httpStatus: 409, body: { error: 'Post the in-kind gift in Accounting first, then release it.' } };
  if (gift.held_account_type !== 'asset') {
    return { httpStatus: 409, body: { error: 'This donated item was booked as an expense when it came in, so there is nothing left to release. Only items kept as an asset can be released as a grant of property.' } };
  }
  const p = await pool.query('SELECT status, hold_reason FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  if (p.rows[0].status === 'on_hold') return { httpStatus: 409, body: { code: 'project_on_hold', error: 'This project is on hold (' + (p.rows[0].hold_reason || '') + '). Releases are blocked until the hold is lifted.' } };
  const existing = await pool.query(`SELECT 1 FROM org_sponsored_project_disbursements WHERE property_gift_id = $1 AND org_id = $2 AND status <> 'void'`, [giftId, orgId]);
  if (existing.rows.length) return { httpStatus: 409, body: { error: 'This donated item is already being released.' } };
  try {
    const r = await pool.query(
      `INSERT INTO org_sponsored_project_disbursements (org_id, sponsored_project_id, disbursement_date, amount_cents, notes, created_by, status, kind, property_gift_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', 'property', $7) RETURNING id, disbursement_date, amount_cents, status, kind`,
      [orgId, projectId, date, Number(gift.amount_cents), (notes ? String(notes).trim() + ': ' : '') + 'Donated property: ' + (gift.in_kind_description || 'gift #' + gift.id), userId, giftId]);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsored_project_disbursements', recordId: r.rows[0].id, metadata: { kind: 'property', gift_id: giftId } });
    return { httpStatus: 201, body: { disbursement: { ...r.rows[0], disbursement_date: isoDate(r.rows[0].disbursement_date) } } };
  } catch (e) {
    if (e.code === '23505') return { httpStatus: 409, body: { error: 'This donated item is already being released.' } };
    throw e;
  }
}

module.exports = { LETTER_METHODS, needsDonorLetter, donorLetters, donorLetterTemplate, attachDonorLetter, sponsoredReceiptLines, sponsoredReceiptInfo, createPropertyRelease };
