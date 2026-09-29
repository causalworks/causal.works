'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { previewIndirectRecovery, runIndirectRecovery } = require('../lib/indirectCostRecovery');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function registerIndirectCostRecoveryRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/indirect-cost-recovery/preview', ...orgAuth, async (req, res) => {
    const periodStart = req.query.period_start_date != null ? String(req.query.period_start_date) : null;
    const periodEnd = req.query.period_end_date != null ? String(req.query.period_end_date) : null;
    if (!periodStart || !DATE_RE.test(periodStart) || !periodEnd || !DATE_RE.test(periodEnd)) {
      return res.status(400).json({ error: 'period_start_date and period_end_date are required and must be YYYY-MM-DD' });
    }
    try {
      const rows = await previewIndirectRecovery(pool, req.orgId, periodStart, periodEnd);
      return res.json({
        grants: rows.map((r) => ({ ...r, mtdc_base_cents: String(r.mtdc_base_cents), recovery_amount_cents: String(r.recovery_amount_cents) })),
        total_cents: String(rows.reduce((s, r) => s + r.recovery_amount_cents, 0)),
      });
    } catch (e) {
      console.error('GET /indirect-cost-recovery/preview:', e.message);
      return res.status(500).json({ error: 'Could not compute indirect cost recovery preview' });
    }
  });

  app.post('/api/organizational/orgs/:slug/indirect-cost-recovery/run', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const periodStart = body.period_start_date != null ? String(body.period_start_date) : null;
    const periodEnd = body.period_end_date != null ? String(body.period_end_date) : null;
    if (!periodStart || !DATE_RE.test(periodStart) || !periodEnd || !DATE_RE.test(periodEnd)) {
      return res.status(400).json({ error: 'period_start_date and period_end_date are required and must be YYYY-MM-DD' });
    }
    const debitAccountId = body.debit_account_id != null ? Number.parseInt(String(body.debit_account_id), 10) : null;
    const creditAccountId = body.credit_account_id != null ? Number.parseInt(String(body.credit_account_id), 10) : null;
    const programId = body.program_id != null ? Number.parseInt(String(body.program_id), 10) : null;
    if (!Number.isInteger(debitAccountId) || !Number.isInteger(creditAccountId) || !Number.isInteger(programId)) {
      return res.status(400).json({ error: 'debit_account_id, credit_account_id, and program_id are all required' });
    }
    try {
      const { posted, failed } = await runIndirectRecovery(pool, {
        orgId, userId, periodStartDate: periodStart, periodEndDate: periodEnd,
        debitAccountId, creditAccountId, programId,
      });
      return res.json({ posted, failed, posted_count: posted.length, failed_count: failed.length });
    } catch (e) {
      console.error('POST /indirect-cost-recovery/run:', e.message);
      return res.status(500).json({ error: 'Could not run indirect cost recovery' });
    }
  });
}

module.exports = { registerIndirectCostRecoveryRoutes };
