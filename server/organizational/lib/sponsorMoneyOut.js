'use strict';

// Sponsored-project money out: payment requests, disbursements and their approval, holds, recalls.
// Every refusal (held project, over balance, own approval, one signature above the threshold) is decided here.

const { loadProjectBalance, loadSponsorSettings, RESTRICTED_CLASS } = require('./sponsorBalance');
const { postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('./ledgerPosting');
const { logAudit } = require('./auditLog');
const { fiscalYearForDate, fyDateRange, getFiscalYearEndMonth } = require('./fiscalYear');
const { isoDate } = require('./sponsorFees');
const { NS, withLock, BUSY } = require('./advisoryLock');

const DEFAULT_SECOND_APPROVAL_CENTS = 500000;
const REQUEST_METHODS = ['check', 'bank_transfer', 'wire', 'card', 'other'];
const BLOCKED_STATUSES = { on_hold: true, ended: true, lapsed: true, applicant: true };

function money(c) {
  const n = Number(c) / 100;
  return (n < 0 ? '-$' : '$') + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function refuse(httpStatus, code, error, extra) {
  return { httpStatus, body: { code, error, ...(extra || {}) } };
}

function projectOpenRefusal(project) {
  if (!BLOCKED_STATUSES[project.status]) return null;
  if (project.status === 'on_hold') {
    return refuse(409, 'project_on_hold', 'This project is on hold (' + (project.hold_reason || 'no reason given') + '). Payments and requests are blocked until the hold is lifted.');
  }
  if (project.status === 'applicant') return refuse(409, 'project_not_active', 'This project has not been accepted yet. Accept it before paying anything out.');
  return refuse(409, 'project_not_active', 'This project has ' + (project.status === 'lapsed' ? 'lapsed' : 'ended') + '. Reactivate it before paying anything out.');
}

// Checks the amount against what the project has available. alreadyCountedCents is the part of this item already
// inside "pending" (an existing request or disbursement), so it is not counted twice.
async function balanceRefusal(pool, { orgId, projectId, amountCents, alreadyCountedCents, override, role }) {
  const b = await loadProjectBalance(pool, orgId, projectId);
  const available = b.balance.available_cents + Number(alreadyCountedCents || 0);
  if (amountCents <= available) return { ok: true, available };
  const reason = override && String(override.reason || '').trim();
  if (override && override.requested) {
    if (role !== 'admin') return { refusal: refuse(403, 'override_admin_only', 'Only an admin can approve more than the project has available.') };
    if (!reason) return { refusal: refuse(400, 'reason_required', 'Enter the reason for approving more than the project has available.') };
    return { ok: true, available, overridden: true, reason };
  }
  return {
    refusal: refuse(409, 'over_balance', 'This is ' + money(amountCents) + ', but the project has ' + money(available) + ' available. Lower the amount, wait for more money to come in, or ask an admin to approve it anyway with a reason.', { available_cents: available }),
  };
}

async function effectiveModel(pool, orgId, project) {
  if (project.sponsorship_model) return project.sponsorship_model;
  const r = await pool.query('SELECT sponsorship_model::text AS m FROM org_settings WHERE org_id = $1', [orgId]);
  return r.rows[0] ? r.rows[0].m : null;
}

// Pre-approved grant model: money is released only as grants to the project's named legal entity, with its taxpayer form
// on file, and each release carries a signed grant agreement before it is approved.
async function grantModelRefusal(pool, { orgId, project, payeeId, agreementDocumentId, stage }) {
  if ((await effectiveModel(pool, orgId, project)) !== 'model_c') return null;
  if (!project.receiving_constituent_id) {
    return refuse(409, 'no_receiving_entity', 'This project uses the pre-approved grant model. Name the legal entity that receives its grants first.');
  }
  if (!project.w9_on_file) {
    return refuse(409, 'w9_missing', 'Get the receiving entity\'s taxpayer identification form (W-9) on file before releasing money.');
  }
  if (payeeId != null && Number(payeeId) !== Number(project.receiving_constituent_id)) {
    return refuse(409, 'payee_not_entity', 'Under the pre-approved grant model, money goes only to the project\'s receiving entity.');
  }
  if (stage === 'approve' && !agreementDocumentId) {
    return refuse(409, 'grant_agreement_missing', 'Attach the signed grant agreement for this release before approving it.');
  }
  return null;
}

async function loadProjectRow(pool, orgId, projectId) {
  const r = await pool.query('SELECT * FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
  return r.rows[0] || null;
}

async function budgetWarning(pool, orgId, project, amountCents) {
  if (project.annual_budget_estimate == null) return null;
  const budgetCents = Math.round(Number(project.annual_budget_estimate) * 100);
  const fyEnd = (await getFiscalYearEndMonth(pool, orgId)) || 12;
  const today = new Date().toISOString().slice(0, 10);
  const { startDate, endDate } = fyDateRange(fiscalYearForDate(today, fyEnd), fyEnd);
  const r = await pool.query(
    `SELECT COALESCE(SUM(amount_cents), 0)::bigint AS spent FROM org_sponsored_project_disbursements
      WHERE org_id = $1 AND sponsored_project_id = $2 AND status <> 'void' AND disbursement_date BETWEEN $3 AND $4`,
    [orgId, project.id, startDate, endDate]);
  const after = Number(r.rows[0].spent) + amountCents;
  if (after <= budgetCents) return null;
  return 'This brings spending this year to ' + money(after) + ', above the approved budget of ' + money(budgetCents) + '. Check it against the budget before approving.';
}

async function secondApprovalThreshold(pool, orgId) {
  const s = await loadSponsorSettings(pool, orgId);
  return s && s.second_approval_threshold_cents != null ? Number(s.second_approval_threshold_cents) : DEFAULT_SECOND_APPROVAL_CENTS;
}

// Payment requests

async function createRequestUnlocked(pool, { orgId, userId, projectId, input, linkRef }) {
  const project = await loadProjectRow(pool, orgId, projectId);
  if (!project) return refuse(404, 'not_found', 'Sponsored project not found');
  const closed = projectOpenRefusal(project);
  if (closed) return closed;
  const amountCents = Number.parseInt(String(input.amount_cents), 10);
  const purpose = String(input.purpose || '').trim();
  const method = input.method ? String(input.method) : 'check';
  const payeeId = Number.parseInt(String(input.payee_constituent_id), 10);
  if (!Number.isInteger(payeeId) || payeeId < 1) return refuse(400, 'payee_required', 'Choose who is being paid (a contact).');
  if (!Number.isInteger(amountCents) || amountCents < 1) return refuse(400, 'amount_required', 'Enter an amount greater than zero.');
  if (!purpose) return refuse(400, 'purpose_required', 'Say what the payment is for.');
  if (!REQUEST_METHODS.includes(method)) return refuse(400, 'bad_method', 'Choose how to pay: check, bank transfer, wire, card or other.');
  const payee = await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [payeeId, orgId]);
  if (!payee.rows.length) return refuse(400, 'payee_required', 'Choose a payee from this workspace\'s contacts.');
  let documentId = null;
  if (input.document_id != null && input.document_id !== '') {
    documentId = Number.parseInt(String(input.document_id), 10);
    const d = await pool.query('SELECT id FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [documentId, orgId, projectId]);
    if (!d.rows.length) return refuse(400, 'bad_document', 'Attach the invoice or receipt to this project first, then choose it here.');
  }
  const neededBy = input.needed_by && DATE_RE.test(String(input.needed_by)) ? String(input.needed_by) : null;
  const grant = await grantModelRefusal(pool, { orgId, project, payeeId, stage: 'create' });
  if (grant) return grant;
  const bal = await balanceRefusal(pool, { orgId, projectId, amountCents });
  if (bal.refusal) return bal.refusal;
  const warning = await budgetWarning(pool, orgId, project, amountCents);
  const r = await pool.query(
    `INSERT INTO org_sponsor_payment_requests
       (org_id, sponsored_project_id, requester_link_ref, payee_constituent_id, amount_cents, purpose, method, document_id, budget_line, needed_by, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [orgId, projectId, linkRef || null, payeeId, amountCents, purpose, method, documentId,
     input.budget_line ? String(input.budget_line).trim() : null, neededBy, userId || null]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_payment_requests', recordId: r.rows[0].id,
    metadata: { sponsored_project_id: projectId, amount_cents: amountCents, link: linkRef ? 'lead link' : null } });
  return { httpStatus: 201, body: { request: r.rows[0], budget_warning: warning } };
}

async function reviewRequestUnlocked(pool, { orgId, userId, role, projectId, requestId, action, reason, override, grantAgreementDocumentId }) {
  const rq = await pool.query('SELECT * FROM org_sponsor_payment_requests WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [requestId, orgId, projectId]);
  const req = rq.rows[0];
  if (!req) return refuse(404, 'not_found', 'Payment request not found');
  if (!['submitted', 'in_review', 'needs_info'].includes(req.status)) return refuse(409, 'already_decided', 'This request is already ' + req.status + '.');
  const why = String(reason || '').trim();
  if (action === 'in_review') {
    await pool.query(`UPDATE org_sponsor_payment_requests SET status = 'in_review', reviewer_id = $1 WHERE id = $2`, [userId, requestId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_payment_requests', recordId: requestId, fields: [{ fieldName: 'status', oldValue: req.status, newValue: 'in_review' }] });
    return { httpStatus: 200, body: { id: requestId, status: 'in_review' } };
  }
  if (action === 'reject' || action === 'needs_info') {
    if (!why) return refuse(400, 'reason_required', action === 'reject' ? 'Enter the reason for rejecting the request.' : 'Say what more information is needed.');
    const status = action === 'reject' ? 'rejected' : 'needs_info';
    await pool.query(`UPDATE org_sponsor_payment_requests SET status = $1, reviewer_id = $2, reviewed_at = now(), decision_reason = $3 WHERE id = $4`, [status, userId, why, requestId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_payment_requests', recordId: requestId,
      fields: [{ fieldName: 'status', oldValue: req.status, newValue: status }], metadata: { reason: why } });
    return { httpStatus: 200, body: { id: requestId, status } };
  }
  if (action !== 'approve') return refuse(400, 'bad_action', 'Choose approve, reject, ask for more information, or start review.');

  if (req.created_by != null && Number(req.created_by) === Number(userId)) {
    return refuse(403, 'self_approval', 'A different person must approve a request you entered.');
  }
  const project = await loadProjectRow(pool, orgId, projectId);
  const closed = projectOpenRefusal(project);
  if (closed) return closed;
  const agreementDoc = grantAgreementDocumentId ? await projectDocumentId(pool, orgId, projectId, grantAgreementDocumentId) : null;
  if (grantAgreementDocumentId && !agreementDoc) return refuse(400, 'bad_document', 'Attach the grant agreement to this project first, then choose it here.');
  const grant = await grantModelRefusal(pool, { orgId, project, payeeId: req.payee_constituent_id, agreementDocumentId: agreementDoc, stage: 'approve' });
  if (grant) return grant;
  const amountCents = Number(req.amount_cents);
  const bal = await balanceRefusal(pool, { orgId, projectId, amountCents, alreadyCountedCents: amountCents, override, role });
  if (bal.refusal) return bal.refusal;

  const ins = await pool.query(
    `INSERT INTO org_sponsored_project_disbursements
       (org_id, sponsored_project_id, disbursement_date, amount_cents, notes, created_by, status, payment_request_id, override_reason, override_by, override_at,
        payee_constituent_id, grant_agreement_document_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', $7, $8, $9, $10, $11, $12) RETURNING id`,
    [orgId, projectId, req.needed_by || new Date().toISOString().slice(0, 10), amountCents, req.purpose, req.created_by, requestId,
     bal.overridden ? bal.reason : null, bal.overridden ? userId : null, bal.overridden ? new Date().toISOString() : null,
     req.payee_constituent_id, agreementDoc]);
  const disbId = ins.rows[0].id;
  await pool.query(
    `UPDATE org_sponsor_payment_requests SET status = 'approved', reviewer_id = $1, reviewed_at = now(), decision_reason = $2, disbursement_id = $3,
            override_reason = $4, override_by = $5, override_at = CASE WHEN $4::text IS NULL THEN NULL ELSE now() END
      WHERE id = $6`, [userId, why || null, disbId, bal.overridden ? bal.reason : null, bal.overridden ? userId : null, requestId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_payment_requests', recordId: requestId,
    fields: [{ fieldName: 'status', oldValue: req.status, newValue: 'approved' }],
    metadata: { disbursement_id: disbId, override_reason: bal.overridden ? bal.reason : null } });
  const appr = await approveDisbursementUnlocked(pool, { orgId, userId, role, projectId, disbursementId: disbId, skipBalance: true });
  return { httpStatus: 200, body: { id: requestId, status: 'approved', disbursement_id: disbId, disbursement: appr.body } };
}

// Disbursements

async function createDisbursementUnlocked(pool, { orgId, userId, role, projectId, input, override }) {
  const project = await loadProjectRow(pool, orgId, projectId);
  if (!project) return refuse(404, 'not_found', 'Sponsored project not found');
  const closed = projectOpenRefusal(project);
  if (closed) return closed;
  const date = input.disbursement_date ? String(input.disbursement_date) : null;
  const amountCents = Number.parseInt(String(input.amount_cents), 10);
  if (!date || !DATE_RE.test(date)) return refuse(400, 'date_required', 'Enter the payment date.');
  if (!Number.isInteger(amountCents) || amountCents < 1) return refuse(400, 'amount_required', 'Enter an amount greater than zero.');
  let payeeId = input.payee_constituent_id != null && input.payee_constituent_id !== '' ? Number.parseInt(String(input.payee_constituent_id), 10) : null;
  if (payeeId != null) {
    const c = await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [payeeId, orgId]);
    if (!c.rows.length) return refuse(400, 'payee_required', 'Choose a payee from this workspace\'s contacts.');
  }
  const grant = await grantModelRefusal(pool, { orgId, project, payeeId, stage: 'create' });
  if (grant) return grant;
  if (payeeId == null && (await effectiveModel(pool, orgId, project)) === 'model_c') payeeId = Number(project.receiving_constituent_id);
  let agreementDoc = null;
  if (input.grant_agreement_document_id) {
    agreementDoc = await projectDocumentId(pool, orgId, projectId, input.grant_agreement_document_id);
    if (!agreementDoc) return refuse(400, 'bad_document', 'Attach the grant agreement to this project first, then choose it here.');
  }
  const bal = await balanceRefusal(pool, { orgId, projectId, amountCents, override, role });
  if (bal.refusal) return bal.refusal;
  const r = await pool.query(
    `INSERT INTO org_sponsored_project_disbursements
       (org_id, sponsored_project_id, disbursement_date, amount_cents, notes, created_by, status, override_reason, override_by, override_at,
        payee_constituent_id, grant_agreement_document_id)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending_approval', $7, $8, CASE WHEN $7::text IS NULL THEN NULL ELSE now() END, $9, $10)
     RETURNING id, disbursement_date, amount_cents, notes, status, created_at, payee_constituent_id, grant_agreement_document_id`,
    [orgId, projectId, date, amountCents, input.notes ? String(input.notes).trim() : null, userId,
     bal.overridden ? bal.reason : null, bal.overridden ? userId : null, payeeId, agreementDoc]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsored_project_disbursements', recordId: r.rows[0].id,
    metadata: { sponsored_project_id: projectId, amount_cents: amountCents, override_reason: bal.overridden ? bal.reason : null } });
  return { httpStatus: 201, body: { disbursement: r.rows[0] } };
}

async function approveDisbursementUnlocked(pool, { orgId, userId, role, projectId, disbursementId, override, skipBalance }) {
  const r = await pool.query('SELECT * FROM org_sponsored_project_disbursements WHERE id = $1 AND sponsored_project_id = $2 AND org_id = $3', [disbursementId, projectId, orgId]);
  const d = r.rows[0];
  if (!d) return refuse(404, 'not_found', 'Disbursement not found');
  if (d.status !== 'pending_approval') return refuse(409, 'not_pending_approval', 'This disbursement is not waiting for approval (it is ' + d.status + ').');
  if (d.created_by != null && Number(d.created_by) === Number(userId)) {
    return refuse(403, 'self_approval', 'A different person must approve a disbursement you requested.');
  }
  if (d.first_approved_by != null && Number(d.first_approved_by) === Number(userId)) {
    return refuse(403, 'second_approver_same', 'You already gave the first approval. A second, different person must approve it.');
  }
  const project = await loadProjectRow(pool, orgId, projectId);
  const closed = projectOpenRefusal(project);
  if (closed) return closed;
  const grant = await grantModelRefusal(pool, { orgId, project, payeeId: d.payee_constituent_id, agreementDocumentId: d.grant_agreement_document_id, stage: 'approve' });
  if (grant) return grant;
  const amountCents = Number(d.amount_cents);
  let overrideReason = null;
  if (!skipBalance && d.kind !== 'property') {
    const bal = await balanceRefusal(pool, { orgId, projectId, amountCents, alreadyCountedCents: amountCents, override, role });
    if (bal.refusal) return bal.refusal;
    if (bal.overridden) overrideReason = bal.reason;
  }
  const threshold = await secondApprovalThreshold(pool, orgId);
  if (amountCents > threshold && d.first_approved_by == null) {
    await pool.query(
      `UPDATE org_sponsored_project_disbursements SET first_approved_by = $1, first_approved_at = now(),
              override_reason = COALESCE($2, override_reason), override_by = CASE WHEN $2::text IS NULL THEN override_by ELSE $1 END,
              override_at = CASE WHEN $2::text IS NULL THEN override_at ELSE now() END
        WHERE id = $3 AND org_id = $4`, [userId, overrideReason, disbursementId, orgId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_project_disbursements', recordId: disbursementId,
      fields: [{ fieldName: 'first approval', oldValue: null, newValue: 'given' }], metadata: { threshold_cents: threshold, override_reason: overrideReason } });
    return { httpStatus: 200, body: { id: disbursementId, status: 'pending_approval', needs_second_approval: true,
      message: 'First approval recorded. Payments above ' + money(threshold) + ' need a second, different person to approve.' } };
  }
  const u = await pool.query(
    `UPDATE org_sponsored_project_disbursements SET status = 'approved', approved_by = $1, approved_at = now(),
            override_reason = COALESCE($2, override_reason), override_by = CASE WHEN $2::text IS NULL THEN override_by ELSE $1 END,
            override_at = CASE WHEN $2::text IS NULL THEN override_at ELSE now() END
      WHERE id = $3 AND org_id = $4 AND status = 'pending_approval' RETURNING id, status, approved_by, approved_at`,
    [userId, overrideReason, disbursementId, orgId]);
  if (!u.rows.length) return refuse(409, 'not_pending_approval', 'This disbursement is no longer waiting for approval.');
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_project_disbursements', recordId: disbursementId,
    fields: [{ fieldName: 'status', oldValue: 'pending_approval', newValue: 'approved' }], metadata: { override_reason: overrideReason } });
  return { httpStatus: 200, body: u.rows[0] };
}

async function projectDocumentId(pool, orgId, projectId, documentId) {
  const n = Number.parseInt(String(documentId), 10);
  if (!Number.isInteger(n) || n < 1) return null;
  const r = await pool.query('SELECT id FROM org_documents WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3 AND archived_at IS NULL', [n, orgId, projectId]);
  return r.rows[0] ? r.rows[0].id : null;
}

async function attachGrantAgreement(pool, { orgId, userId, projectId, disbursementId, documentId }) {
  const d = await pool.query('SELECT id, status, grant_agreement_document_id FROM org_sponsored_project_disbursements WHERE id = $1 AND org_id = $2 AND sponsored_project_id = $3', [disbursementId, orgId, projectId]);
  if (!d.rows.length) return refuse(404, 'not_found', 'Disbursement not found');
  if (d.rows[0].status !== 'pending_approval') return refuse(409, 'not_pending_approval', 'The grant agreement can be changed only while the release waits for approval.');
  const doc = await projectDocumentId(pool, orgId, projectId, documentId);
  if (!doc) return refuse(400, 'bad_document', 'Attach the signed grant agreement to this project first, then choose it here.');
  await pool.query('UPDATE org_sponsored_project_disbursements SET grant_agreement_document_id = $1 WHERE id = $2', [doc, disbursementId]);
  await pool.query(`UPDATE org_documents SET sponsor_doc_type = 'agreement' WHERE id = $1 AND org_id = $2 AND sponsor_doc_type IS NULL`, [doc, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_project_disbursements', recordId: disbursementId,
    fields: [{ fieldName: 'grant agreement', oldValue: d.rows[0].grant_agreement_document_id, newValue: doc }] });
  return { httpStatus: 200, body: { id: disbursementId, grant_agreement_document_id: doc } };
}

// Receiving entity and its taxpayer form, for the pre-approved grant model
async function setGrantEntity(pool, { orgId, userId, projectId, input }) {
  const p = await loadProjectRow(pool, orgId, projectId);
  if (!p) return refuse(404, 'not_found', 'Sponsored project not found');
  const fields = [];
  let entity = p.receiving_constituent_id;
  let w9Doc = p.w9_document_id;
  let w9At = p.w9_received_at ? isoDate(p.w9_received_at) : null;
  if (input.receiving_constituent_id !== undefined) {
    const n = input.receiving_constituent_id ? Number.parseInt(String(input.receiving_constituent_id), 10) : null;
    if (n != null) {
      const c = await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [n, orgId]);
      if (!c.rows.length) return refuse(400, 'bad_contact', 'Choose the receiving entity from this workspace\'s contacts.');
    }
    if (Number(n) !== Number(entity)) {
      fields.push({ fieldName: 'receiving entity', oldValue: entity, newValue: n });
      entity = n;
      if (input.w9_document_id === undefined) { w9Doc = null; w9At = null; }
    }
  }
  if (input.w9_document_id !== undefined) {
    const doc = input.w9_document_id ? await projectDocumentId(pool, orgId, projectId, input.w9_document_id) : null;
    if (input.w9_document_id && !doc) return refuse(400, 'bad_document', 'Upload the W-9 to this project first, then choose it here.');
    if (doc && !entity) return refuse(400, 'no_receiving_entity', 'Name the receiving entity first.');
    w9At = doc ? (input.w9_received_at && DATE_RE.test(String(input.w9_received_at)) ? String(input.w9_received_at) : new Date().toISOString().slice(0, 10)) : null;
    if (Number(doc) !== Number(w9Doc)) fields.push({ fieldName: 'W-9', oldValue: w9Doc, newValue: doc });
    w9Doc = doc;
    if (doc) await pool.query(`UPDATE org_documents SET sponsor_doc_type = 'tax_form' WHERE id = $1 AND org_id = $2 AND sponsor_doc_type IS NULL`, [doc, orgId]);
  }
  await pool.query(
    `UPDATE org_sponsored_projects SET receiving_constituent_id = $1, w9_document_id = $2, w9_on_file = $3, w9_received_at = $4, updated_at = now()
      WHERE id = $5 AND sponsor_org_id = $6`, [entity, w9Doc, !!w9Doc, w9At, projectId, orgId]);
  if (fields.length) await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_projects', recordId: projectId, fields });
  return { httpStatus: 200, body: { id: projectId, receiving_constituent_id: entity, w9_on_file: !!w9Doc, w9_document_id: w9Doc, w9_received_at: w9At } };
}

// Holds

async function placeHold(pool, { orgId, userId, projectId, reason }) {
  const why = String(reason || '').trim();
  if (!why) return refuse(400, 'reason_required', 'Enter the reason for putting the project on hold.');
  const p = await loadProjectRow(pool, orgId, projectId);
  if (!p) return refuse(404, 'not_found', 'Sponsored project not found');
  if (p.status === 'on_hold') return refuse(409, 'already_on_hold', 'This project is already on hold.');
  await pool.query(
    `UPDATE org_sponsored_projects SET status_before_hold = status, status = 'on_hold', hold_kind = 'manual', hold_reason = $1,
            hold_set_by = $2, hold_set_at = now(), updated_at = now() WHERE id = $3 AND sponsor_org_id = $4`, [why, userId, projectId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_projects', recordId: projectId,
    fields: [{ fieldName: 'status', oldValue: p.status, newValue: 'on_hold' }], metadata: { reason: why } });
  return { httpStatus: 200, body: { id: projectId, status: 'on_hold' } };
}

async function liftHold(pool, { orgId, userId, role, projectId, reason }) {
  const why = String(reason || '').trim();
  if (!why) return refuse(400, 'reason_required', 'Enter the reason for lifting the hold.');
  const p = await loadProjectRow(pool, orgId, projectId);
  if (!p) return refuse(404, 'not_found', 'Sponsored project not found');
  if (p.status !== 'on_hold') return refuse(409, 'not_on_hold', 'This project is not on hold.');
  if (p.hold_kind === 'report_overdue' && role !== 'admin') {
    return refuse(403, 'admin_only', 'This hold is for an overdue report. It lifts by itself when the report is received; only an admin can lift it earlier.');
  }
  await pool.query(
    `UPDATE org_sponsored_projects SET status = COALESCE(status_before_hold, 'active'), status_before_hold = NULL,
            report_hold_waived_for = CASE WHEN hold_kind = 'report_overdue' THEN next_report_due ELSE report_hold_waived_for END,
            hold_kind = NULL, hold_reason = NULL, hold_set_by = NULL, hold_set_at = NULL, updated_at = now()
      WHERE id = $1 AND sponsor_org_id = $2`, [projectId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsored_projects', recordId: projectId,
    fields: [{ fieldName: 'status', oldValue: 'on_hold', newValue: p.status_before_hold || 'active' }], metadata: { reason: why, hold_kind: p.hold_kind } });
  return { httpStatus: 200, body: { id: projectId, status: p.status_before_hold || 'active' } };
}

// Recalls

async function createRecall(pool, { orgId, userId, projectId, input }) {
  const why = String(input.reason || '').trim();
  const amountCents = Number.parseInt(String(input.amount_cents), 10);
  const date = input.recall_date ? String(input.recall_date) : new Date().toISOString().slice(0, 10);
  if (!why) return refuse(400, 'reason_required', 'Enter the reason for recalling the money.');
  if (!Number.isInteger(amountCents) || amountCents < 1) return refuse(400, 'amount_required', 'Enter an amount greater than zero.');
  if (!DATE_RE.test(date)) return refuse(400, 'date_required', 'Enter the recall date.');
  const p = await loadProjectRow(pool, orgId, projectId);
  if (!p) return refuse(404, 'not_found', 'Sponsored project not found');
  const r = await pool.query(
    `INSERT INTO org_sponsor_recalls (org_id, sponsored_project_id, amount_cents, recall_date, reason, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [orgId, projectId, amountCents, date, why, userId]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_recalls', recordId: r.rows[0].id, metadata: { sponsored_project_id: projectId, amount_cents: amountCents, reason: why } });
  return { httpStatus: 201, body: { recall: r.rows[0] } };
}

async function postRecallUnlocked(pool, { orgId, userId, recallId, postingDate }) {
  const r = await pool.query(
    `SELECT r.*, p.name AS project_name, p.program_id FROM org_sponsor_recalls r JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
      WHERE r.id = $1 AND r.org_id = $2`, [recallId, orgId]);
  const rc = r.rows[0];
  if (!rc) return refuse(404, 'not_found', 'Recall not found');
  if (rc.status !== 'pending') return refuse(409, 'not_pending', 'This recall is already ' + rc.status + '.');
  const date = postingDate || isoDate(rc.recall_date);
  if (!DATE_RE.test(date)) return refuse(400, 'date_required', 'Enter the posting date.');
  const s = await loadSponsorSettings(pool, orgId);
  const expense = s && (s.recall_expense_account_id || s.fee_expense_account_id);
  const income = s && (s.recall_income_account_id || s.fee_income_account_id);
  if (!expense || !income || !s.fee_income_program_id) return refuse(400, 'settings_missing', 'Set the recall (or fee) accounts and the fee income program in sponsorship settings first.');
  if (rc.program_id == null) return refuse(400, 'no_program', 'Link this project to a program first.');
  const amount = Number(rc.amount_cents);
  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: date, memo: 'Funds recalled from ' + rc.project_name + ': ' + rc.reason, payee: null, referenceNumber: null,
    lines: [
      { account_id: expense, program_id: rc.program_id, donor_restriction_class: RESTRICTED_CLASS, debit_cents: amount, credit_cents: 0 },
      { account_id: income, program_id: s.fee_income_program_id, donor_restriction_class: 'unrestricted', debit_cents: 0, credit_cents: amount },
    ],
    source: 'sponsor_recall',
    internalApproval: { approvedBy: userId, sourceRefId: recallId, sourceRefType: 'org_sponsor_recalls' },
  });
  if (result.httpStatus >= 400) return result;
  await pool.query(`UPDATE org_sponsor_recalls SET status = 'posted', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`, [result.body.id, recallId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_recalls', recordId: recallId,
    fields: [{ fieldName: 'status', oldValue: 'pending', newValue: 'posted' }], metadata: { ledger_transaction_id: result.body.id } });
  return { httpStatus: 200, body: { id: recallId, status: 'posted', ledger_transaction_id: result.body.id } };
}

async function voidRecallUnlocked(pool, { orgId, userId, recallId, reason }) {
  const why = String(reason || '').trim();
  if (!why) return refuse(400, 'reason_required', 'Enter the reason for cancelling the recall.');
  const r = await pool.query('SELECT * FROM org_sponsor_recalls WHERE id = $1 AND org_id = $2', [recallId, orgId]);
  const rc = r.rows[0];
  if (!rc) return refuse(404, 'not_found', 'Recall not found');
  if (rc.status === 'void') return refuse(409, 'already_void', 'This recall is already cancelled.');
  if (rc.ledger_transaction_id) {
    const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: rc.ledger_transaction_id, voidReason: why });
    if (v.httpStatus >= 400 && v.body.code !== 'already_voided') return v;
  }
  await pool.query(`UPDATE org_sponsor_recalls SET status = 'void', void_reason = $1 WHERE id = $2 AND org_id = $3`, [why, recallId, orgId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_recalls', recordId: recallId,
    fields: [{ fieldName: 'status', oldValue: rc.status, newValue: 'void' }], metadata: { reason: why } });
  return { httpStatus: 200, body: { id: recallId, status: 'void' } };
}

const byProject = (fn) => (pool, a) => withLock(pool, NS.projectMoney, a.projectId, () => fn(pool, a), BUSY);
const byRecall = (fn) => (pool, a) => withLock(pool, NS.recallPost, a.recallId, () => fn(pool, a), BUSY);
const createRequest = byProject(createRequestUnlocked);
const reviewRequest = byProject(reviewRequestUnlocked);
const createDisbursement = byProject(createDisbursementUnlocked);
const approveDisbursement = byProject(approveDisbursementUnlocked);
const postRecall = byRecall(postRecallUnlocked);
const voidRecall = byRecall(voidRecallUnlocked);

module.exports = {
  effectiveModel, grantModelRefusal, attachGrantAgreement, setGrantEntity, projectDocumentId,
  REQUEST_METHODS, projectOpenRefusal, balanceRefusal, budgetWarning, createRequest, reviewRequest,
  createDisbursement, approveDisbursement, placeHold, liftHold, createRecall, postRecall, voidRecall,
};
