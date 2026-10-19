'use strict';

// Sponsorship intake: applications from prospective projects and the accept-or-decline decision that creates the project.

const { logAudit } = require('./auditLog');
const { loadSponsorSettings } = require('./sponsorBalance');
const { DEFAULT_FEE_RATE } = require('./sponsorFees');

const TEXT_FIELDS = ['mission', 'activities', 'leaders', 'expected_funders', 'risks'];

async function contactInOrg(pool, orgId, id) {
  if (id == null || id === '') return null;
  const n = Number.parseInt(String(id), 10);
  if (!Number.isInteger(n) || n < 1) return false;
  const r = await pool.query('SELECT id FROM org_constituents WHERE id = $1 AND org_id = $2', [n, orgId]);
  return r.rows.length ? n : false;
}

async function createApplication(pool, { orgId, userId, input, source }) {
  const name = String(input.project_name || '').trim();
  if (!name) return { httpStatus: 400, body: { error: 'Enter the project\'s name.' } };
  const applicant = await contactInOrg(pool, orgId, input.applicant_constituent_id);
  const lead = await contactInOrg(pool, orgId, input.lead_constituent_id);
  if (applicant === false || lead === false) return { httpStatus: 400, body: { error: 'Choose contacts from this workspace.' } };
  if (!lead) return { httpStatus: 400, body: { error: 'Choose the project lead (a contact), so the workspace can reach them.' } };
  let budget = null;
  if (input.budget_cents != null && input.budget_cents !== '') {
    budget = Number.parseInt(String(input.budget_cents), 10);
    if (!Number.isInteger(budget) || budget < 0) return { httpStatus: 400, body: { error: 'The budget must be zero or more.' } };
  }
  const vals = TEXT_FIELDS.map((k) => (input[k] ? String(input[k]).trim().slice(0, 10000) : null));
  const r = await pool.query(
    `INSERT INTO org_sponsor_applications (org_id, applicant_constituent_id, lead_constituent_id, project_name, mission, activities, leaders, expected_funders, risks, budget_cents, source, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [orgId, applicant, lead, name, ...vals, budget, source || 'staff', userId || null]);
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsor_applications', recordId: r.rows[0].id, metadata: { source: source || 'staff' } });
  return { httpStatus: 201, body: { application: r.rows[0] } };
}

async function decideApplication(pool, { orgId, userId, applicationId, decision, reason, programId, model }) {
  const why = String(reason || '').trim();
  const a = await pool.query('SELECT * FROM org_sponsor_applications WHERE id = $1 AND org_id = $2', [applicationId, orgId]);
  const app = a.rows[0];
  if (!app) return { httpStatus: 404, body: { error: 'Application not found' } };
  if (app.status === 'accepted' || app.status === 'declined') return { httpStatus: 409, body: { code: 'already_decided', error: 'This application is already ' + app.status + '.' } };
  if (decision === 'in_review') {
    await pool.query(`UPDATE org_sponsor_applications SET status = 'in_review' WHERE id = $1`, [applicationId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_applications', recordId: applicationId, fields: [{ fieldName: 'status', oldValue: app.status, newValue: 'in_review' }] });
    return { httpStatus: 200, body: { id: applicationId, status: 'in_review' } };
  }
  if (!why) return { httpStatus: 400, body: { code: 'reason_required', error: decision === 'decline' ? 'Enter the reason for declining.' : 'Enter the reason for accepting (for example, the board decision).' } };
  if (decision === 'decline') {
    await pool.query(`UPDATE org_sponsor_applications SET status = 'declined', decided_by = $1, decided_at = now(), decision_reason = $2 WHERE id = $3`, [userId, why, applicationId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_applications', recordId: applicationId,
      fields: [{ fieldName: 'status', oldValue: app.status, newValue: 'declined' }], metadata: { reason: why } });
    return { httpStatus: 200, body: { id: applicationId, status: 'declined' } };
  }
  if (decision !== 'accept') return { httpStatus: 400, body: { error: 'Choose accept or decline.' } };
  let program = null;
  if (programId != null && programId !== '') {
    program = Number.parseInt(String(programId), 10);
    const p = await pool.query('SELECT id FROM org_programs WHERE id = $1 AND org_id = $2', [program, orgId]);
    if (!p.rows.length) return { httpStatus: 400, body: { error: 'Choose a program from this workspace.' } };
  }
  if (model != null && model !== '' && !['model_a', 'model_c', 'other'].includes(model)) return { httpStatus: 400, body: { error: 'Choose a sponsorship model.' } };
  const defaults = (await pool.query('SELECT default_admin_rate FROM org_settings WHERE org_id = $1', [orgId])).rows[0] || {};
  const settings = await loadSponsorSettings(pool, orgId);
  const proj = await pool.query(
    `INSERT INTO org_sponsored_projects (sponsor_org_id, name, description, status, program_id, sponsorship_model, annual_budget_estimate, lead_constituent_id, start_date)
     VALUES ($1, $2, $3, 'accepted', $4, $5, $6, $7, CURRENT_DATE) RETURNING id`,
    [orgId, app.project_name, app.mission, program, model || null, app.budget_cents != null ? Number(app.budget_cents) / 100 : null, app.lead_constituent_id]);
  const projectId = proj.rows[0].id;
  await pool.query(
    `INSERT INTO org_sponsor_fee_rules (org_id, sponsored_project_id, kind, rate, minimum_quarter_cents, effective_from, created_by)
     VALUES ($1, $2, 'percent', $3, $4, CURRENT_DATE, $5)`,
    [orgId, projectId, defaults.default_admin_rate != null ? Number(defaults.default_admin_rate) : DEFAULT_FEE_RATE,
     settings ? Number(settings.default_fee_minimum_cents || 0) : 0, userId]);
  await pool.query(
    `UPDATE org_sponsor_applications SET status = 'accepted', decided_by = $1, decided_at = now(), decision_reason = $2, sponsored_project_id = $3 WHERE id = $4`,
    [userId, why, projectId, applicationId]);
  await pool.query(`UPDATE org_documents SET sponsored_project_id = $1 WHERE org_id = $2 AND source_ref_type = 'org_sponsor_applications' AND source_ref_id = $3`, [projectId, orgId, applicationId]);
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_applications', recordId: applicationId,
    fields: [{ fieldName: 'status', oldValue: app.status, newValue: 'accepted' }], metadata: { reason: why, sponsored_project_id: projectId } });
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_sponsored_projects', recordId: projectId, metadata: { from_application: applicationId } });
  return { httpStatus: 200, body: { id: applicationId, status: 'accepted', sponsored_project_id: projectId } };
}

module.exports = { createApplication, decideApplication };
