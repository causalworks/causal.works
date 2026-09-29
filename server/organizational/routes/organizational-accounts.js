'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');

const CODE_MAX = 64;
const NAME_MAX = 500;

const NP_ACCOUNT_TYPES = new Set(['income', 'expense', 'asset', 'liability']);

const BUDGET_SCOPE_ROOT_CODES = `('_H1_REV', '_H1_INC', '_H1_EXP')`;

function rowToAccount(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    code: row.code,
    name: row.name,
    type: row.type,
    xero_account_id: row.xero_account_id || null,
    parent_id: row.parent_id != null ? Number(row.parent_id) : null,
    rollup_parent_id: row.rollup_parent_id != null ? Number(row.rollup_parent_id) : null,
    is_posting: row.is_posting != null ? !!row.is_posting : true,
    level: row.level != null ? Number(row.level) : 3,
    standard_category: row.standard_category != null ? String(row.standard_category) : null,
    budget_source: row.budget_source || 'schedule',
    is_cash_account: !!row.is_cash_account,
    is_system_clearing_account: !!row.is_system_clearing_account,
    is_system_ap_account: !!row.is_system_ap_account,
    is_system_ar_account: !!row.is_system_ar_account,
    is_system_contribution_revenue_account: !!row.is_system_contribution_revenue_account,
    is_non_cash: !!row.is_non_cash,
    is_mtdc_excluded: !!row.is_mtdc_excluded,
    is_system_unallocated_receipts_account: !!row.is_system_unallocated_receipts_account,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalAccountRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  app.get('/api/organizational/orgs/:slug/accounts', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const budgetScope =
      req.query.budget_scope === '1' ||
      req.query.budget_scope === 'true' ||
      String(req.query.budget_scope || '').toLowerCase() === 'yes';

    try {
      let sql;
      let params;
      if (budgetScope) {
        sql = `
          WITH RECURSIVE roots AS (
            SELECT id FROM org_accounts
            WHERE org_id = $1 AND code IN ${BUDGET_SCOPE_ROOT_CODES}
          ),
          tr AS (
            SELECT id FROM roots
            UNION ALL
            SELECT a.id FROM org_accounts a
            INNER JOIN tr ON a.parent_id = tr.id
            WHERE a.org_id = $1
          )
          SELECT a.id, a.org_id, a.code, a.name, a.type::text AS type, a.xero_account_id,
                 a.parent_id, a.rollup_parent_id, a.is_posting, a.level,
                 a.standard_category, a.budget_source, a.is_cash_account, a.is_system_clearing_account,
                 a.is_system_ap_account, a.is_system_ar_account, a.is_system_contribution_revenue_account,
                 a.is_non_cash, a.is_mtdc_excluded, a.is_system_unallocated_receipts_account,
                 a.created_at, a.updated_at
          FROM org_accounts a
          WHERE a.org_id = $1
            AND (
              (EXISTS (SELECT 1 FROM roots) AND a.id IN (SELECT id FROM tr))
              OR (NOT EXISTS (SELECT 1 FROM roots) AND a.type IN ('income'::org_account_type, 'expense'::org_account_type))
            )
          ORDER BY lower(a.code) ASC, a.id ASC`;
        params = [orgId];
      } else {
        sql = `
          SELECT id, org_id, code, name, type::text AS type, xero_account_id,
                 parent_id, rollup_parent_id, is_posting, level,
                 standard_category, budget_source, is_cash_account, is_system_clearing_account,
                 is_system_ap_account, is_system_ar_account, is_system_contribution_revenue_account,
                 is_non_cash, is_mtdc_excluded, is_system_unallocated_receipts_account,
                 created_at, updated_at
          FROM org_accounts
          WHERE org_id = $1
          ORDER BY lower(code) ASC, id ASC`;
        params = [orgId];
      }

      const r = await pool.query(sql, params);
      return res.json({ accounts: r.rows.map(rowToAccount) });
    } catch (e) {
      console.error('GET /api/organizational/orgs/:slug/accounts:', e.message);
      return res.status(500).json({ error: 'Could not load accounts' });
    }
  });

  app.post('/api/organizational/orgs/:slug/accounts', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const code = String(body.code ?? '').trim();
    const name = String(body.name ?? '').trim();
    const type = String(body.type ?? '').trim().toLowerCase();
    let standardCategory = null;
    if (body.standard_category !== undefined && body.standard_category !== null && String(body.standard_category).trim() !== '') {
      standardCategory = String(body.standard_category).trim();
      if (standardCategory.length > 32) {
        return res.status(400).json({ error: 'standard_category is too long' });
      }
    }

    if (!code) return res.status(400).json({ error: 'code is required' });
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!NP_ACCOUNT_TYPES.has(type)) {
      return res.status(400).json({ error: 'type must be income, expense, asset, or liability' });
    }
    if (code.length > CODE_MAX) {
      return res.status(400).json({ error: `code must be at most ${CODE_MAX} characters` });
    }
    if (name.length > NAME_MAX) {
      return res.status(400).json({ error: `name must be at most ${NAME_MAX} characters` });
    }
    // is_cash_account: only meaningful on an asset account (a bank/card account is definitionally
    // one) -- lets the Plaid mapping panel create a brand-new cash account inline instead of only
    // offering existing ones, without needing a general account-edit endpoint (none exists yet;
    // this app has no PATCH .../accounts/:id at all, so this flag is otherwise only ever set by
    // seed/chart-template data).
    const isCashAccount = !!body.is_cash_account;
    if (isCashAccount && type !== 'asset') {
      return res.status(400).json({ error: 'is_cash_account can only be set on an asset account' });
    }

    try {
      const ins = await pool.query(
        `INSERT INTO org_accounts (org_id, code, name, type, standard_category, is_cash_account)
         VALUES ($1, $2, $3, $4::org_account_type, $5, $6)
         RETURNING id, org_id, code, name, type::text AS type, xero_account_id,
                   parent_id, rollup_parent_id, is_posting, level,
                   standard_category, is_cash_account, created_at, updated_at`,
        [orgId, code, name, type, standardCategory, isCashAccount]
      );
      return res.status(201).json({ account: rowToAccount(ins.rows[0]) });
    } catch (e) {
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'An account with that code already exists' });
      }
      console.error('POST /api/organizational/orgs/:slug/accounts:', e.message);
      return res.status(500).json({ error: 'Could not create account' });
    }
  });
}

module.exports = { registerOrganizationalAccountRoutes };
