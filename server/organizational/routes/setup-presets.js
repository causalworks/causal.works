'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
// Only for POST /setup-presets' source_slug lookup below -- that route has
// no :slug URL param (it names the source org in the request body instead),
// so requireOrgMembership's URL-param-based resolution doesn't apply there.
const { orgIdForMember } = require('../lib/resolveOrganizationalOrg');
const { applyOrganizationalAccountBulkInsert } = require('../lib/OrganizationalAccountBulkInsert');

const NAME_MAX = 120;
const ACCOUNT_TYPES = new Set(['income', 'expense', 'asset', 'liability', 'equity']);

// Presets are captured from an org's real, already-live org_accounts rows (see
// accountsToSnapshot below) — not user-typed input — so replaying them does NOT go
// through normalizeAndValidateBulkAccounts(). That validator enforces rules meant for
// new manual entry (standard_category required, a narrower type set than the
// org_account_type DB enum) which real accumulated org data can violate (blank
// standard_category, 'equity'-typed accounts) without being invalid. This only checks
// what applyOrganizationalAccountBulkInsert itself needs to run safely.
function normalizeSnapshotAccountsForReplay(accountsIn) {
  if (!Array.isArray(accountsIn) || accountsIn.length === 0) {
    return { error: 'Saved template has no accounts' };
  }
  const rows = [];
  const codes = new Set();
  for (const a of accountsIn) {
    const code = String((a && a.code) ?? '').trim();
    const name = String((a && a.name) ?? '').trim();
    const type = String((a && a.type) ?? '').trim().toLowerCase();
    if (!code || !name || !ACCOUNT_TYPES.has(type)) {
      return { error: 'Saved template contains an invalid account row' };
    }
    if (codes.has(code)) {
      return { error: `Duplicate code in saved template: ${code}` };
    }
    codes.add(code);
    rows.push({
      code,
      name,
      type,
      standard_category: String((a && a.standard_category) ?? '').trim(),
      rollup_parent_code: a && a.rollup_parent_code ? String(a.rollup_parent_code).trim() : '',
      xero_account_id: '',
      is_posting: a && a.is_posting !== undefined ? Boolean(a.is_posting) : true,
      level: a && a.level != null ? Number(a.level) : 3,
      budget_source: a && a.budget_source ? String(a.budget_source) : 'schedule',
    });
  }
  const byCode = new Map(rows.map((r) => [r.code, r]));
  for (const r of rows) {
    if (r.rollup_parent_code && !byCode.has(r.rollup_parent_code)) {
      return { error: `Saved template references unknown parent code: ${r.rollup_parent_code}` };
    }
  }
  return { rows };
}

async function requireAdminRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  const role = String((r.rows[0] && r.rows[0].role) || '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function rowToPreset(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    source_org_id: row.source_org_id,
    fiscal_year_end_month: row.fiscal_year_end_month,
    account_count: row.account_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Accounts as stored in org_accounts, reshaped to match what
// normalizeAndValidateBulkAccounts()/POST accounts/bulk already accepts, so a
// preset can be replayed through that same validated insert pipeline.
function accountsToSnapshot(accountRows) {
  const idToCode = new Map(accountRows.map((a) => [a.id, a.code]));
  return accountRows.map((a) => ({
    code: a.code,
    name: a.name,
    type: a.type,
    standard_category: a.standard_category,
    rollup_parent_code: a.rollup_parent_id != null ? idToCode.get(a.rollup_parent_id) || '' : '',
    xero_account_id: '', // presets are reusable structure, not tied to a specific Xero tenant
    is_posting: a.is_posting,
    level: a.level,
    budget_source: a.budget_source,
  }));
}

function registerOrganizationalSetupPresetRoutes(app, pool) {
  const auth = requireAuth(pool);
  // These first three routes are user-scoped, not org-scoped (no :slug in
  // their URL — "my saved presets" regardless of which org) — plain auth
  // only. Only apply-preset (has :slug) needs org membership.
  const orgAuth = [auth, requireOrganizationalAccess];
  const npOrg = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/setup-presets', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT id, name, source_org_id, fiscal_year_end_month, account_count, created_at, updated_at
         FROM user_org_setup_presets WHERE user_id = $1 ORDER BY created_at DESC`,
        [userId]
      );
      return res.json({ presets: r.rows.map(rowToPreset) });
    } catch (e) {
      if (e.message && /user_org_setup_presets|does not exist/i.test(e.message)) {
        return res.status(500).json({ error: 'Run migration 124_onboarding_wizard_redesign.sql' });
      }
      console.error('GET /setup-presets:', e.message);
      return res.status(500).json({ error: 'Could not load saved setups' });
    }
  });

  app.post('/api/organizational/setup-presets', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const name = String(body.name || '').trim();
    const sourceSlug = String(body.source_slug || '').trim();
    if (!name || name.length > NAME_MAX) {
      return res.status(400).json({ error: 'name is required (max 120 characters)' });
    }
    if (!sourceSlug) {
      return res.status(400).json({ error: 'source_slug is required' });
    }
    try {
      const orgId = await orgIdForMember(pool, userId, sourceSlug);
      if (!orgId) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      if (!(await requireAdminRole(pool, orgId, userId))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const orgRow = await pool.query(
        `SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1`,
        [orgId]
      );
      const accountsRes = await pool.query(
        `SELECT id, code, name, type::text AS type, standard_category, rollup_parent_id, is_posting, level, budget_source
         FROM org_accounts WHERE org_id = $1 ORDER BY id`,
        [orgId]
      );
      if (accountsRes.rows.length === 0) {
        return res.status(400).json({ error: 'This workspace has no accounts to save as a template yet' });
      }
      const programsRes = await pool.query(
        `SELECT name, code FROM org_programs WHERE org_id = $1 AND parent_id IS NULL ORDER BY id`,
        [orgId]
      );

      const accountsSnapshot = accountsToSnapshot(accountsRes.rows);
      const programsSnapshot = programsRes.rows.map((p) => ({ name: p.name, code: p.code }));

      const ins = await pool.query(
        `INSERT INTO user_org_setup_presets
           (user_id, name, source_org_id, accounts_snapshot, programs_snapshot, fiscal_year_end_month, account_count)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)
         RETURNING id, name, source_org_id, fiscal_year_end_month, account_count, created_at, updated_at`,
        [
          userId,
          name,
          orgId,
          JSON.stringify(accountsSnapshot),
          JSON.stringify(programsSnapshot),
          orgRow.rows[0] && orgRow.rows[0].fiscal_year_end_month,
          accountsSnapshot.length,
        ]
      );
      return res.status(201).json({ preset: rowToPreset(ins.rows[0]) });
    } catch (e) {
      if (e.message && /user_org_setup_presets|does not exist/i.test(e.message)) {
        return res.status(500).json({ error: 'Run migration 124_onboarding_wizard_redesign.sql' });
      }
      console.error('POST /setup-presets:', e.message);
      return res.status(500).json({ error: 'Could not save template' });
    }
  });

  app.delete('/api/organizational/setup-presets/:id', ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const del = await pool.query(
        `DELETE FROM user_org_setup_presets WHERE id = $1 AND user_id = $2`,
        [id, userId]
      );
      if (del.rowCount === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /setup-presets:', e.message);
      return res.status(500).json({ error: 'Could not delete template' });
    }
  });

  app.post('/api/organizational/orgs/:slug/apply-preset', ...npOrg, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const presetId = Number.parseInt(String(body.preset_id || ''), 10);
    if (!Number.isInteger(presetId) || presetId < 1) {
      return res.status(400).json({ error: 'preset_id is required' });
    }

    const client = await pool.connect();
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const presetRes = await client.query(
        `SELECT accounts_snapshot, programs_snapshot FROM user_org_setup_presets WHERE id = $1 AND user_id = $2`,
        [presetId, userId]
      );
      if (presetRes.rows.length === 0) {
        return res.status(404).json({ error: 'Template not found' });
      }

      const existing = await client.query(
        `SELECT COUNT(*)::int AS c FROM org_accounts WHERE org_id = $1`,
        [orgId]
      );
      if (existing.rows[0].c > 0) {
        return res.status(409).json({
          error: 'This workspace already has accounts. Manage them from the dashboard.',
        });
      }

      const norm = normalizeSnapshotAccountsForReplay(presetRes.rows[0].accounts_snapshot);
      if (norm.error) {
        return res.status(400).json({ error: norm.error });
      }

      await client.query('BEGIN');
      let listRows;
      try {
        listRows = await applyOrganizationalAccountBulkInsert(client, orgId, norm.rows);

        const programsSnapshot = Array.isArray(presetRes.rows[0].programs_snapshot)
          ? presetRes.rows[0].programs_snapshot
          : [];
        for (const p of programsSnapshot) {
          if (!p || !p.name) continue;
          await client.query(
            `INSERT INTO org_programs (org_id, name, code)
             VALUES ($1, $2, $3)
             ON CONFLICT DO NOTHING`,
            [orgId, p.name, p.code || null]
          );
        }
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
      console.error('POST /apply-preset:', e.message);
      return res.status(500).json({ error: 'Could not apply template' });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerOrganizationalSetupPresetRoutes };
