'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { ACCOUNT_TEMPLATES } = require('../data/account-templates');
const { STANDARD_COA_CATEGORIES } = require('../data/standardCoaCategories');
const {
  normalizeAndValidateBulkAccounts,
  applyOrganizationalAccountBulkInsert,
} = require('../lib/OrganizationalAccountBulkInsert');

const ONBOARDING_STEPS = new Set(['basics', 'accounts', 'prior_data', 'programs', 'complete']);

function registerOrganizationalOnboardingRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/account-templates', ...orgAuth, async (req, res) => {
    try {
      return res.json({ templates: ACCOUNT_TEMPLATES });
    } catch (e) {
      console.error('GET account-templates:', e.message);
      return res.status(500).json({ error: 'Could not load templates' });
    }
  });

  app.get('/api/organizational/orgs/:slug/standard-categories', ...orgAuth, async (req, res) => {
    try {
      return res.json({ categories: STANDARD_COA_CATEGORIES });
    } catch (e) {
      console.error('GET standard-categories:', e.message);
      return res.status(500).json({ error: 'Could not load categories' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/onboarding-step', ...orgAuth, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const step = String(body.step || '').trim();
    if (!ONBOARDING_STEPS.has(step)) {
      return res.status(400).json({ error: 'Invalid step' });
    }
    try {
      const orgId = req.orgId;

      if (step === 'complete') {
        const acctRes = await pool.query(
          `SELECT COUNT(*)::int AS c FROM org_accounts WHERE org_id = $1`,
          [orgId]
        );
        const orgRes = await pool.query(
          `SELECT onboarding_blank_coa_chosen FROM org_settings WHERE org_id = $1`,
          [orgId]
        );
        if (acctRes.rows[0].c === 0 && !orgRes.rows[0].onboarding_blank_coa_chosen) {
          return res.status(409).json({
            error: 'Add a chart of accounts before finishing setup.',
            hint: 'Go back to the Accounts step, or choose "Start with a blank workspace" if you really want to begin with none.',
          });
        }
      }

      const completedAt = step === 'complete' ? new Date().toISOString() : null;
      const r = await pool.query(
        `UPDATE org_settings
         SET onboarding_step = $2::text,
             onboarding_completed_at = CASE WHEN $2::text = 'complete' THEN COALESCE(onboarding_completed_at, NOW()) ELSE onboarding_completed_at END,
             updated_at = NOW()
         WHERE org_id = $1
         RETURNING onboarding_step, onboarding_completed_at`,
        [orgId, step]
      );
      return res.json({
        ok: true,
        onboarding_step: r.rows[0].onboarding_step,
        onboarding_completed_at: r.rows[0].onboarding_completed_at,
      });
    } catch (e) {
      if (e.message && /onboarding_step|check|violates/i.test(e.message)) {
        return res.status(500).json({ error: 'Run migration 048_coop_onboarding_and_standard_coa.sql' });
      }
      console.error('PATCH onboarding-step:', e.message);
      return res.status(500).json({ error: 'Could not update step' });
    }
  });

  app.post('/api/organizational/orgs/:slug/onboarding/confirm-blank-coa', ...orgAuth, async (req, res) => {
    try {
      const orgId = req.orgId;
      await pool.query(
        `UPDATE org_settings SET onboarding_blank_coa_chosen = true, updated_at = NOW() WHERE org_id = $1`,
        [orgId]
      );
      return res.json({ ok: true });
    } catch (e) {
      if (e.message && /onboarding_blank_coa_chosen|does not exist/i.test(e.message)) {
        return res.status(500).json({ error: 'Run migration 124_onboarding_wizard_redesign.sql' });
      }
      console.error('POST confirm-blank-coa:', e.message);
      return res.status(500).json({ error: 'Could not save choice' });
    }
  });

  app.post('/api/organizational/orgs/:slug/accounts/bulk', ...npAdmin, async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const accountsIn = Array.isArray(body.accounts) ? body.accounts : null;
    if (!accountsIn || accountsIn.length === 0) {
      return res.status(400).json({ error: 'accounts must be a non-empty array' });
    }

    const client = await pool.connect();
    try {
      const orgId = req.orgId;

      const existing = await client.query(
        `SELECT COUNT(*)::int AS c FROM org_accounts WHERE org_id = $1`,
        [orgId]
      );
      if (existing.rows[0].c > 0) {
        return res.status(409).json({
          error: 'This workspace already has accounts. Manage them from the dashboard.',
        });
      }

      const norm = normalizeAndValidateBulkAccounts(accountsIn);
      if (norm.row_errors) {
        return res.status(400).json({ error: 'Validation failed', row_errors: norm.row_errors });
      }
      if (norm.error) {
        return res.status(400).json({ error: norm.error });
      }
      const rows = norm.rows;

      await client.query('BEGIN');
      let listRows;
      try {
        listRows = await applyOrganizationalAccountBulkInsert(client, orgId, rows);
      } catch (e) {
        await client.query('ROLLBACK');
        if (e && e.code === '23505') {
          return res.status(409).json({ error: e.message || 'Duplicate account code' });
        }
        throw e;
      }
      await client.query('COMMIT');

      return res.status(201).json({ accounts: listRows });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      if (
        e.message &&
        /standard_category|parent_id|is_posting|level|column .* does not exist/i.test(e.message)
      ) {
        return res.status(500).json({
          error: 'Run migrations 048_coop_onboarding_and_standard_coa.sql and 051_coop_accounts_hierarchy.sql',
        });
      }
      console.error('POST accounts/bulk:', e.message);
      return res.status(500).json({ error: 'Could not save accounts' });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerOrganizationalOnboardingRoutes };
