'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireWriteAccess, requireReadAccess, leadMayTouch, canWrite, boardApproverAllowed } = require('../middleware/requireWriteAccess');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { loadProjectBalance } = require('../lib/sponsorBalance');

function requireFiscalSponsorship(pool) {
  return async function (req, res, next) {
    const r = await pool.query(
      `SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1`,
      [req.orgId]
    );
    if (!r.rows[0] || !r.rows[0].fiscal_sponsorship_mode) {
      return res.status(403).json({ error: 'Fiscal sponsorship mode is not enabled for this organization' });
    }
    next();
  };
}

const VALID_SPONSORSHIP_MODELS = ['model_a', 'model_c', 'other'];

function withEffectiveFields(project, orgDefaults) {
  return {
    ...project,
    effective_sponsorship_model: project.sponsorship_model || orgDefaults.sponsorship_model || null,
    effective_admin_rate: project.current_fee_rate != null ? project.current_fee_rate
      : project.admin_rate != null ? project.admin_rate : orgDefaults.default_admin_rate,
  };
}

async function loadOrgDefaults(pool, orgId) {
  const r = await pool.query(
    `SELECT sponsorship_model, default_admin_rate FROM org_settings WHERE org_id = $1`,
    [orgId]
  );
  return r.rows[0] || { sponsorship_model: null, default_admin_rate: null };
}

async function validateProgramId(pool, orgId, programId) {
  if (programId == null) return true;
  const r = await pool.query('SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1', [programId, orgId]);
  return r.rows.length > 0;
}

function registerSponsoredProjectsRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireFiscalSponsorship(pool)];

  app.get('/api/organizational/orgs/:slug/sponsored-projects', ...orgAuth, boardSeesAllPrograms, async (req, res) => {
    try {
      const [r, orgDefaults] = await Promise.all([
        pool.query(
          `SELECT id,
                  sponsor_org_id,
                  name,
                  description,
                  start_date,
                  end_date,
                  contact_lead_name,
                  contact_lead_email,
                  annual_budget_estimate,
                  status,
                  notes_markdown,
                  sponsorship_model,
                  program_id,
                  admin_rate,
                  next_report_due,
                  last_report_received_at,
                  created_at,
                  updated_at,
                  agreement_signed_at,
                  (SELECT r.rate FROM org_sponsor_fee_rules r WHERE r.sponsored_project_id = org_sponsored_projects.id AND r.kind = 'percent'
                     AND r.effective_from <= CURRENT_DATE ORDER BY r.effective_from DESC LIMIT 1) AS current_fee_rate,
                  (SELECT r.kind FROM org_sponsor_fee_rules r WHERE r.sponsored_project_id = org_sponsored_projects.id
                     AND r.effective_from <= CURRENT_DATE ORDER BY r.effective_from DESC LIMIT 1) AS current_fee_kind,
                  (SELECT COUNT(*)::int FROM org_documents d WHERE d.sponsored_project_id = org_sponsored_projects.id AND d.archived_at IS NULL) AS document_count
           FROM org_sponsored_projects
           WHERE sponsor_org_id = $1
           ORDER BY status, created_at DESC`,
          [req.orgId]
        ),
        loadOrgDefaults(pool, req.orgId),
      ]);

      return res.json({ sponsored_projects: r.rows.map((p) => withEffectiveFields(p, orgDefaults)) });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/sponsored-projects:', e.message);
      return res.status(500).json({ error: 'Could not load sponsored projects' });
    }
  });

  app.post('/api/organizational/orgs/:slug/sponsored-projects', ...orgAuth, requireWriteAccess('sponsorship'), async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const name = String(body.name || '').trim();
    const description = body.description ? String(body.description).trim() : null;
    const startDate = body.start_date ? new Date(body.start_date) : null;
    const endDate = body.end_date ? new Date(body.end_date) : null;
    const contactLeadName = body.contact_lead_name ? String(body.contact_lead_name).trim() : null;
    const contactLeadEmail = body.contact_lead_email ? String(body.contact_lead_email).trim() : null;
    const annualBudgetEstimate = body.annual_budget_estimate !== undefined ? Number(body.annual_budget_estimate) : null;
    const status = String(body.status || 'active').trim();
    const notesMarkdown = body.notes_markdown ? String(body.notes_markdown).trim() : null;
    const sponsorshipModel = body.sponsorship_model ? String(body.sponsorship_model).trim() : null;
    const programId = body.program_id !== undefined && body.program_id !== null ? Number(body.program_id) : null;
    const adminRate = body.admin_rate !== undefined && body.admin_rate !== null ? Number(body.admin_rate) : null;
    const nextReportDue = body.next_report_due ? String(body.next_report_due) : null;

    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    const validStatuses = ['active', 'paused', 'completed', 'winding_down'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (startDate && Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ error: 'start_date must be a valid date' });
    }
    if (endDate && Number.isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'end_date must be a valid date' });
    }
    if (annualBudgetEstimate !== null && (!Number.isFinite(annualBudgetEstimate) || annualBudgetEstimate < 0)) {
      return res.status(400).json({ error: 'annual_budget_estimate must be a non-negative number' });
    }
    if (sponsorshipModel !== null && !VALID_SPONSORSHIP_MODELS.includes(sponsorshipModel)) {
      return res.status(400).json({ error: `sponsorship_model must be one of ${VALID_SPONSORSHIP_MODELS.join(', ')}` });
    }
    if (programId !== null && (!Number.isInteger(programId) || programId < 1)) {
      return res.status(400).json({ error: 'program_id must be a positive integer' });
    }
    if (adminRate !== null && (!Number.isFinite(adminRate) || adminRate < 0 || adminRate > 100)) {
      return res.status(400).json({ error: 'admin_rate must be between 0 and 100' });
    }

    try {
      if (!leadMayTouch(req, [programId])) {
        return res.status(403).json({ code: 'program_scope', error: 'Program leads can add a sponsored project only under one of their own programs.' });
      }
      if (programId !== null && !(await validateProgramId(pool, req.orgId, programId))) {
        return res.status(400).json({ error: 'program_id does not belong to this organization' });
      }

      const r = await pool.query(
        `INSERT INTO org_sponsored_projects
           (sponsor_org_id, name, description, start_date, end_date, contact_lead_name, contact_lead_email,
            annual_budget_estimate, status, notes_markdown, sponsorship_model, program_id, admin_rate, next_report_due)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING id, sponsor_org_id, name, description, start_date, end_date, contact_lead_name, contact_lead_email,
                   annual_budget_estimate, status, notes_markdown, sponsorship_model, program_id, admin_rate,
                   disbursement_expense_account_id, next_report_due, last_report_received_at, created_at, updated_at`,
        [req.orgId, name, description, startDate, endDate, contactLeadName, contactLeadEmail, annualBudgetEstimate,
         status, notesMarkdown, sponsorshipModel, programId, adminRate, nextReportDue]
      );

      if (adminRate !== null) {
        await pool.query(
          `INSERT INTO org_sponsor_fee_rules (org_id, sponsored_project_id, kind, rate, effective_from, created_by)
           VALUES ($1, $2, 'percent', $3, COALESCE($4::date, CURRENT_DATE), $5)`,
          [req.orgId, r.rows[0].id, adminRate, startDate, req.user.user_id ?? req.user.id]);
      }
      const orgDefaults = await loadOrgDefaults(pool, req.orgId);
      return res.status(201).json({ sponsored_project: withEffectiveFields(r.rows[0], orgDefaults) });
    } catch (e) {
      console.error('POST /api/organizational/orgs/:slug/sponsored-projects:', e.message);
      return res.status(500).json({ error: 'Could not create sponsored project' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/sponsored-projects/:id', ...orgAuth, requireWriteAccess('sponsorship'), async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sponsored project ID' });
    }

    try {
      const curProj = await pool.query('SELECT program_id, admin_rate FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1', [id, req.orgId]);
      if (!curProj.rows.length) return res.status(404).json({ error: 'Sponsored project not found' });
      if (!leadMayTouch(req, [curProj.rows[0].program_id])) {
        return res.status(403).json({ code: 'program_scope', error: 'Program leads can change only sponsored projects under their own programs.' });
      }
      const updates = [];
      const values = [];
      let paramIndex = 2;

      if (body.name !== undefined) {
        if (!String(body.name).trim()) {
          return res.status(400).json({ error: 'name cannot be empty' });
        }
        updates.push(`name = $${paramIndex}`);
        values.push(String(body.name).trim());
        paramIndex++;
      }

      if (body.description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        values.push(body.description ? String(body.description).trim() : null);
        paramIndex++;
      }

      if (body.start_date !== undefined) {
        const startDate = body.start_date ? new Date(body.start_date) : null;
        if (startDate && Number.isNaN(startDate.getTime())) {
          return res.status(400).json({ error: 'start_date must be a valid date' });
        }
        updates.push(`start_date = $${paramIndex}`);
        values.push(startDate);
        paramIndex++;
      }

      if (body.end_date !== undefined) {
        const endDate = body.end_date ? new Date(body.end_date) : null;
        if (endDate && Number.isNaN(endDate.getTime())) {
          return res.status(400).json({ error: 'end_date must be a valid date' });
        }
        updates.push(`end_date = $${paramIndex}`);
        values.push(endDate);
        paramIndex++;
      }

      if (body.contact_lead_name !== undefined) {
        updates.push(`contact_lead_name = $${paramIndex}`);
        values.push(body.contact_lead_name ? String(body.contact_lead_name).trim() : null);
        paramIndex++;
      }

      if (body.contact_lead_email !== undefined) {
        updates.push(`contact_lead_email = $${paramIndex}`);
        values.push(body.contact_lead_email ? String(body.contact_lead_email).trim() : null);
        paramIndex++;
      }

      if (body.annual_budget_estimate !== undefined) {
        const budget = Number(body.annual_budget_estimate);
        if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
          return res.status(400).json({ error: 'annual_budget_estimate must be a non-negative number' });
        }
        updates.push(`annual_budget_estimate = $${paramIndex}`);
        values.push(budget);
        paramIndex++;
      }

      if (body.status !== undefined) {
        const validStatuses = ['active', 'paused', 'completed', 'winding_down'];
        if (!validStatuses.includes(body.status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }
        updates.push(`status = $${paramIndex}`);
        values.push(body.status);
        paramIndex++;
      }

      if (body.notes_markdown !== undefined) {
        updates.push(`notes_markdown = $${paramIndex}`);
        values.push(body.notes_markdown ? String(body.notes_markdown).trim() : null);
        paramIndex++;
      }

      if (body.sponsorship_model !== undefined) {
        const sm = body.sponsorship_model ? String(body.sponsorship_model).trim() : null;
        if (sm !== null && !VALID_SPONSORSHIP_MODELS.includes(sm)) {
          return res.status(400).json({ error: `sponsorship_model must be one of ${VALID_SPONSORSHIP_MODELS.join(', ')}` });
        }
        updates.push(`sponsorship_model = $${paramIndex}`);
        values.push(sm);
        paramIndex++;
      }

      if (body.program_id !== undefined) {
        const pid = body.program_id !== null ? Number(body.program_id) : null;
        if (pid !== null && (!Number.isInteger(pid) || pid < 1)) {
          return res.status(400).json({ error: 'program_id must be a positive integer' });
        }
        if (pid !== null && !(await validateProgramId(pool, req.orgId, pid))) {
          return res.status(400).json({ error: 'program_id does not belong to this organization' });
        }
        if (!leadMayTouch(req, [pid])) {
          return res.status(403).json({ code: 'program_scope', error: 'Program leads can move a sponsored project only to one of their own programs.' });
        }
        updates.push(`program_id = $${paramIndex}`);
        values.push(pid);
        paramIndex++;
      }

      if (body.disbursement_expense_account_id !== undefined) {
        const aid = body.disbursement_expense_account_id !== null ? Number(body.disbursement_expense_account_id) : null;
        if (aid !== null && (!Number.isInteger(aid) || aid < 1)) {
          return res.status(400).json({ error: 'disbursement_expense_account_id must be a positive integer' });
        }
        updates.push(`disbursement_expense_account_id = $${paramIndex}`);
        values.push(aid);
        paramIndex++;
      }

      if (body.admin_rate !== undefined) {
        const hasRule = await pool.query('SELECT 1 FROM org_sponsor_fee_rules WHERE sponsored_project_id = $1 AND org_id = $2 LIMIT 1', [id, req.orgId]);
        const oldRate = curProj.rows[0].admin_rate != null ? Number(curProj.rows[0].admin_rate) : null;
        const newRate = body.admin_rate !== null && body.admin_rate !== '' ? Number(body.admin_rate) : null;
        if (hasRule.rows.length && oldRate !== newRate) {
          return res.status(409).json({ code: 'fee_rule_exists', error: 'This project has a fee rule. Change the fee in the project\'s Fees section.' });
        }
        const rate = body.admin_rate !== null ? Number(body.admin_rate) : null;
        if (rate !== null && (!Number.isFinite(rate) || rate < 0 || rate > 100)) {
          return res.status(400).json({ error: 'admin_rate must be between 0 and 100' });
        }
        updates.push(`admin_rate = $${paramIndex}`);
        values.push(rate);
        paramIndex++;
      }

      if (body.next_report_due !== undefined) {
        updates.push(`next_report_due = $${paramIndex}`);
        values.push(body.next_report_due ? String(body.next_report_due) : null);
        paramIndex++;
      }

      if (body.last_report_received_at !== undefined) {
        updates.push(`last_report_received_at = $${paramIndex}`);
        values.push(body.last_report_received_at ? String(body.last_report_received_at) : null);
        paramIndex++;
      }

      if (updates.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updates.push(`updated_at = NOW()`);
      values.unshift(id);

      const r = await pool.query(
        `UPDATE org_sponsored_projects
         SET ${updates.join(', ')}
         WHERE id = $1 AND sponsor_org_id = $${paramIndex}
         RETURNING id, sponsor_org_id, name, description, start_date, end_date, contact_lead_name, contact_lead_email,
                   annual_budget_estimate, status, notes_markdown, sponsorship_model, program_id, admin_rate,
                   disbursement_expense_account_id, next_report_due, last_report_received_at, created_at, updated_at`,
        [...values, req.orgId]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Sponsored project not found' });
      }

      const orgDefaults = await loadOrgDefaults(pool, req.orgId);
      return res.json({ sponsored_project: withEffectiveFields(r.rows[0], orgDefaults) });
    } catch (e) {
      console.error('PATCH /api/organizational/orgs/:slug/sponsored-projects/:id:', e.message);
      return res.status(500).json({ error: 'Could not update sponsored project' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/sponsored-projects/:id', ...orgAuth, requireWriteAccess('finance'), async (req, res) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sponsored project ID' });
    }

    try {
      const r = await pool.query(
        `DELETE FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 RETURNING id`,
        [id, req.orgId]
      );

      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Sponsored project not found' });
      }

      return res.json({ success: true });
    } catch (e) {
      console.error('DELETE /api/organizational/orgs/:slug/sponsored-projects/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete sponsored project' });
    }
  });

  app.get('/api/organizational/orgs/:slug/sponsored-projects/:id/tracking', ...orgAuth, requireReadAccess('sponsorship'), boardSeesAllPrograms, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sponsored project ID' });
    }
    try {
      const projR = await pool.query(
        'SELECT id FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1',
        [id, req.orgId]
      );
      if (!projR.rows.length) return res.status(404).json({ error: 'Sponsored project not found' });

      const [giftsR, disbR] = await Promise.all([
        pool.query(
          `SELECT id, amount_cents, currency, received_at, campaign, gift_type::text AS gift_type, sponsor_fee_exempt, sponsor_fee_exempt_reason,
                  posting_status, ledger_transaction_id
           FROM org_gifts WHERE org_id = $1 AND sponsored_project_id = $2 AND posting_status <> 'void' AND review_status <> 'dismissed'
           ORDER BY received_at DESC`,
          [req.orgId, id]
        ),
        pool.query(
          `SELECT id, disbursement_date, amount_cents, admin_fee_cents, notes, status, approved_by, approved_at, created_at, ledger_transaction_id
           FROM org_sponsored_project_disbursements WHERE org_id = $1 AND sponsored_project_id = $2
           ORDER BY disbursement_date DESC`,
          [req.orgId, id]
        ),
      ]);

      const b = await loadProjectBalance(pool, req.orgId, id);
      const bal = b.balance;

      return res.json({
        summary: {
          total_received_cents: bal.received_posted_cents + bal.received_unposted_cents,
          total_disbursed_cents: bal.disbursed_posted_cents,
          total_admin_fee_cents: Math.max(bal.fees_accrued_cents, bal.fees_posted_cents),
          pending_disbursed_cents: bal.pending_disbursements_cents,
          balance_cents: bal.available_cents,
        },
        balance: bal,
        gifts: giftsR.rows,
        disbursements: disbR.rows,
      });
    } catch (e) {
      console.error('GET .../sponsored-projects/:id/tracking:', e.message);
      return res.status(500).json({ error: 'Could not load tracking data' });
    }
  });

  app.post('/api/organizational/orgs/:slug/sponsored-projects/:id/disbursements', ...orgAuth, requireWriteAccess('sponsorship'), async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sponsored project ID' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const disbursementDate = body.disbursement_date ? String(body.disbursement_date) : null;
    const amountCents = Number.parseInt(String(body.amount_cents), 10);
    const adminFeeCents = body.admin_fee_cents !== undefined && body.admin_fee_cents !== null
      ? Number.parseInt(String(body.admin_fee_cents), 10) : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!disbursementDate || Number.isNaN(new Date(disbursementDate).getTime())) {
      return res.status(400).json({ error: 'disbursement_date is required and must be a valid date' });
    }
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      return res.status(400).json({ error: 'amount_cents must be a positive integer' });
    }
    if (adminFeeCents !== null && (!Number.isInteger(adminFeeCents) || adminFeeCents < 0)) {
      return res.status(400).json({ error: 'admin_fee_cents must be a non-negative integer' });
    }

    try {
      const projR = await pool.query(
        'SELECT id, program_id FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1',
        [id, req.orgId]
      );
      if (!projR.rows.length) return res.status(404).json({ error: 'Sponsored project not found' });
      if (!leadMayTouch(req, [projR.rows[0].program_id])) {
        return res.status(403).json({ code: 'program_scope', error: 'Program leads can request a disbursement only for a sponsored project under their own programs.' });
      }

      const userId = req.user.user_id ?? req.user.id;
      const r = await pool.query(
        `INSERT INTO org_sponsored_project_disbursements
           (org_id, sponsored_project_id, disbursement_date, amount_cents, admin_fee_cents, notes, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_approval')
         RETURNING id, disbursement_date, amount_cents, admin_fee_cents, notes, status, created_at`,
        [req.orgId, id, disbursementDate, amountCents, adminFeeCents, notes, userId]
      );

      logAudit(pool, {
        orgId: req.orgId, userId, action: 'create',
        tableName: 'org_sponsored_project_disbursements', recordId: r.rows[0].id,
        metadata: { ...reqMeta(req), sponsored_project_id: id, amount_cents: amountCents, admin_fee_cents: adminFeeCents },
      }).catch(() => {});

      return res.status(201).json({ disbursement: r.rows[0] });
    } catch (e) {
      console.error('POST .../sponsored-projects/:id/disbursements:', e.message);
      return res.status(500).json({ error: 'Could not record disbursement' });
    }
  });

  app.post('/api/organizational/orgs/:slug/sponsored-projects/:id/disbursements/:disbId/approve', ...orgAuth, async (req, res, next) => {
    try {
      if (canWrite(req, 'finance')) return next();
      if (req.coopOrgRole === 'board' && await boardApproverAllowed(pool, req.orgId)) return next();
    } catch (e) { console.error('approver check:', e.message); }
    return res.status(403).json({ code: 'no_write_access', error: 'Approving a disbursement is for finance and admins. Ask an admin if you need access.' });
  }, async (req, res) => {
    const id = Number(req.params.id);
    const disbId = Number(req.params.disbId);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(disbId) || disbId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const disbR = await pool.query(
        'SELECT * FROM org_sponsored_project_disbursements WHERE id = $1 AND sponsored_project_id = $2 AND org_id = $3 LIMIT 1',
        [disbId, id, req.orgId]
      );
      if (!disbR.rows.length) return res.status(404).json({ error: 'Disbursement not found' });
      const disb = disbR.rows[0];
      if (disb.status !== 'pending_approval') {
        return res.status(409).json({ error: `Disbursement is not awaiting approval (status: ${disb.status})`, code: 'not_pending_approval' });
      }

      const userId = req.user.user_id ?? req.user.id;
      if (disb.created_by != null && Number(disb.created_by) === Number(userId)) {
        return res.status(403).json({ code: 'self_approval', error: 'A different person must approve a disbursement you requested.' });
      }
      const r = await pool.query(
        `UPDATE org_sponsored_project_disbursements
         SET status = 'approved', approved_by = $1, approved_at = NOW()
         WHERE id = $2 AND org_id = $3
         RETURNING id, status, approved_by, approved_at`,
        [userId, disbId, req.orgId]
      );

      logAudit(pool, {
        orgId: req.orgId, userId, action: 'update',
        tableName: 'org_sponsored_project_disbursements', recordId: disbId,
        fields: [{ fieldName: 'status', oldValue: 'pending_approval', newValue: 'approved' }],
        metadata: reqMeta(req),
      }).catch(() => {});

      return res.json({ disbursement: r.rows[0] });
    } catch (e) {
      console.error('POST .../disbursements/:disbId/approve:', e.message);
      return res.status(500).json({ error: 'Could not approve disbursement' });
    }
  });
}

module.exports = { registerSponsoredProjectsRoutes };
