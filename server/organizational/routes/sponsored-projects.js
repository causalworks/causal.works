'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit, reqMeta } = require('../lib/auditLog');

// Local to this route file, not middleware/ -- fiscal_sponsorship_mode is specific to
// this one feature, not a general access-control concern any other route needs.
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

// Project-level fields are NULL = "inherit the org-wide default" (same shape as a ledger
// line's restriction class defaulting from its grant's -- Ledger_Module_V1_Spec.md 3.2).
// Computed once here rather than duplicated in every consumer (routes and frontend alike).
function withEffectiveFields(project, orgDefaults) {
  return {
    ...project,
    effective_sponsorship_model: project.sponsorship_model || orgDefaults.sponsorship_model || null,
    effective_admin_rate: project.admin_rate != null ? project.admin_rate : orgDefaults.default_admin_rate,
  };
}

async function loadOrgDefaults(pool, orgId) {
  const r = await pool.query(
    `SELECT sponsorship_model, default_admin_rate FROM org_settings WHERE org_id = $1`,
    [orgId]
  );
  return r.rows[0] || { sponsorship_model: null, default_admin_rate: null };
}

/** program_id must belong to the same org -- FK constraints check against the full table
 * regardless of RLS, so a cross-org id would otherwise pass the FK check silently even
 * though a SELECT would never show it. */
async function validateProgramId(pool, orgId, programId) {
  if (programId == null) return true;
  const r = await pool.query('SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1', [programId, orgId]);
  return r.rows.length > 0;
}

function registerSponsoredProjectsRoutes(app, pool) {
  const auth = requireAuth(pool);
  // Slug-scoped, like every other Organizational route -- requireOrgMembership resolves
  // :slug into req.orgId and verifies the viewer is actually a member of THAT org, instead
  // of the previous no-:slug routes whose handlers read an always-empty req.params.slug and
  // 404d for every org, every time.
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireFiscalSponsorship(pool)];

  // GET /api/organizational/orgs/:slug/sponsored-projects - Get org's sponsored projects (only if fiscal sponsorship mode enabled)
  app.get('/api/organizational/orgs/:slug/sponsored-projects', ...orgAuth, async (req, res) => {
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

  // POST /api/organizational/orgs/:slug/sponsored-projects - Create new sponsored project
  app.post('/api/organizational/orgs/:slug/sponsored-projects', ...orgAuth, async (req, res) => {
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

      const orgDefaults = await loadOrgDefaults(pool, req.orgId);
      return res.status(201).json({ sponsored_project: withEffectiveFields(r.rows[0], orgDefaults) });
    } catch (e) {
      console.error('POST /api/organizational/orgs/:slug/sponsored-projects:', e.message);
      return res.status(500).json({ error: 'Could not create sponsored project' });
    }
  });

  // PATCH /api/organizational/orgs/:slug/sponsored-projects/:id - Update sponsored project
  app.patch('/api/organizational/orgs/:slug/sponsored-projects/:id', ...orgAuth, async (req, res) => {
    const id = Number(req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid sponsored project ID' });
    }

    try {
      // Build update query
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
        updates.push(`program_id = $${paramIndex}`);
        values.push(pid);
        paramIndex++;
      }

      // Set only from Bank Reconciliation's Match tab inline picker (same segregation-of-duties
      // precedent as org_grants.revenue_account_id) -- which GL account a disbursement posts to
      // is an Accounting decision, not a Sponsorship one.
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

  // DELETE /api/organizational/orgs/:slug/sponsored-projects/:id - Delete sponsored project
  app.delete('/api/organizational/orgs/:slug/sponsored-projects/:id', ...orgAuth, async (req, res) => {
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

  // Standard (pass-through) FS tracking: revenue received (real org_gifts designated to
  // this project, not a separately-entered total that could drift) and net disbursements
  // paid out, minus the admin fee retained per disbursement.
  //
  // Every disbursement starts pending_approval (migration 230, Phase 3) and requires a
  // distinct, deliberate /approve action before it counts toward the tracking totals below --
  // no auto-posting. Deliberately NOT the same shape as the federal-award gate
  // (org_enforce_bill_approval_separation_of_duties, migration 207), which blocks same-user
  // approval: that requirement comes from 2 CFR 200.303's internal-controls mandate, a
  // different legal basis than variance power, which just requires genuine review and the
  // ability to say no, not a different approver. A hard separation-of-duties rule here would
  // contradict this codebase's own established "light-touch by default, mandatory sign-off
  // reserved for the federal-award case" philosophy (migration 207's own comment), not follow it.

  // GET /api/organizational/orgs/:slug/sponsored-projects/:id/tracking
  app.get('/api/organizational/orgs/:slug/sponsored-projects/:id/tracking', ...orgAuth, async (req, res) => {
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
          `SELECT id, amount_cents, currency, received_at, campaign, gift_type::text AS gift_type
           FROM org_gifts WHERE org_id = $1 AND sponsored_project_id = $2
           ORDER BY received_at DESC`,
          [req.orgId, id]
        ),
        pool.query(
          `SELECT id, disbursement_date, amount_cents, admin_fee_cents, notes, status, approved_by, approved_at, created_at
           FROM org_sponsored_project_disbursements WHERE org_id = $1 AND sponsored_project_id = $2
           ORDER BY disbursement_date DESC`,
          [req.orgId, id]
        ),
      ]);

      const totalReceivedCents = giftsR.rows.reduce((sum, g) => sum + Number(g.amount_cents), 0);
      // Only approved disbursements count as money actually out the door for reporting --
      // a pending_approval one hasn't cleared the review step yet.
      const approvedDisbursements = disbR.rows.filter((d) => d.status === 'approved');
      const totalDisbursedCents = approvedDisbursements.reduce((sum, d) => sum + Number(d.amount_cents), 0);
      const totalFeeCents = approvedDisbursements.reduce((sum, d) => sum + Number(d.admin_fee_cents || 0), 0);
      const pendingDisbursedCents = disbR.rows
        .filter((d) => d.status === 'pending_approval')
        .reduce((sum, d) => sum + Number(d.amount_cents), 0);

      return res.json({
        summary: {
          total_received_cents: totalReceivedCents,
          total_disbursed_cents: totalDisbursedCents,
          total_admin_fee_cents: totalFeeCents,
          pending_disbursed_cents: pendingDisbursedCents,
          balance_cents: totalReceivedCents - totalDisbursedCents - totalFeeCents,
        },
        gifts: giftsR.rows,
        disbursements: disbR.rows,
      });
    } catch (e) {
      console.error('GET .../sponsored-projects/:id/tracking:', e.message);
      return res.status(500).json({ error: 'Could not load tracking data' });
    }
  });

  // POST /api/organizational/orgs/:slug/sponsored-projects/:id/disbursements
  app.post('/api/organizational/orgs/:slug/sponsored-projects/:id/disbursements', ...orgAuth, async (req, res) => {
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
        'SELECT id FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1',
        [id, req.orgId]
      );
      if (!projR.rows.length) return res.status(404).json({ error: 'Sponsored project not found' });

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

  // POST /api/organizational/orgs/:slug/sponsored-projects/:id/disbursements/:disbId/approve
  // The actual compliance checkpoint: a distinct, deliberate action separate from creating
  // the disbursement record. No same-user restriction (see comment above the tracking route
  // for why not) -- what matters is that this step exists and is logged, not who clicks it.
  app.post('/api/organizational/orgs/:slug/sponsored-projects/:id/disbursements/:disbId/approve', ...orgAuth, async (req, res) => {
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
