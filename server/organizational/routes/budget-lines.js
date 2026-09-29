'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { invalidateOrganizationalSummaryCache } = require('../lib/OrganizationalSummaryService');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { programScopeFor } = require('../lib/programScope');

async function requireAdminRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  const role = String((r.rows[0] && r.rows[0].role) || '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function parseAmountCents(body, allowNull = false) {
  if (body.amount_cents !== undefined && body.amount_cents !== null && body.amount_cents !== '') {
    const n = Number(body.amount_cents);
    if (!Number.isInteger(n) || n < 0) return { error: 'amount_cents must be a non-negative integer' };
    return { value: n };
  }
  if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== '') {
    const x = Number(String(body.amount).replace(/,/g, ''));
    if (!Number.isFinite(x) || x < 0) return { error: 'amount must be a non-negative number' };
    return { value: Math.round(x * 100) };
  }
  if (allowNull) return { value: null };
  return { error: 'amount is required' };
}

function rowToBudgetLine(row) {
  if (!row) return null;
  const c = row.amount_cents != null ? Number(row.amount_cents) : 0;
  return {
    id: row.id != null ? Number(row.id) : null,
    org_id: row.org_id,
    account_id: row.account_id,
    program_id: row.program_id != null ? Number(row.program_id) : null,
    grant_id: row.grant_id,
    fiscal_year: row.fiscal_year,
    month: row.month,
    amount_cents: c,
    amount_dollars: Math.round(c) / 100,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalBudgetLineRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/budget-lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required (e.g. 2025)' });
    }

    const aggregatePrograms =
      req.query.aggregate_programs === '1' ||
      req.query.aggregate_programs === 'true' ||
      String(req.query.aggregate_programs || '').toLowerCase() === 'yes';

    const programRaw = req.query.program_id;
    let programId =
      programRaw !== undefined && programRaw !== null && String(programRaw).trim() !== ''
        ? Number.parseInt(String(programRaw), 10)
        : null;
    if (!aggregatePrograms && programId != null && (!Number.isInteger(programId) || programId < 1)) {
      return res.status(400).json({ error: 'program_id invalid' });
    }
    if (aggregatePrograms) {
      programId = null;
    }

    const unscoped =
      req.query.unscoped === '1' ||
      req.query.unscoped === 'true' ||
      String(req.query.unscoped || '').toLowerCase() === 'yes';
    const grantRaw = req.query.grant_id;
    let grantId = null;
    let filterGrant = false;
    if (!unscoped && grantRaw !== undefined && grantRaw !== null && String(grantRaw).trim() !== '') {
      grantId = Number.parseInt(String(grantRaw), 10);
      if (!Number.isInteger(grantId) || grantId < 1) {
        return res.status(400).json({ error: 'grant_id invalid' });
      }
      filterGrant = true;
    }

    try {
      const conds = ['bl.org_id = $1', 'bl.fiscal_year = $2'];
      const params = [orgId, fy];
      let p = 3;

      if (!aggregatePrograms && programId != null) {
        conds.push(`bl.program_id = $${p}`);
        params.push(programId);
        p += 1;
      }
      if (unscoped) {
        conds.push('bl.grant_id IS NULL');
      } else if (filterGrant) {
        conds.push(`bl.grant_id = $${p}`);
        params.push(grantId);
        p += 1;
      }

      // A 'program'-role caller only ever sees their granted program(s), regardless of what
      // program_id/aggregate_programs/unscoped they pass -- combines safely with any of the
      // above (an out-of-grant program_id just returns 0 rows, not an error).
      const scope = programScopeFor(req);
      if (scope !== null) {
        conds.push(`bl.program_id = ANY($${p}::int[])`);
        params.push(scope);
        p += 1;
      }

      const selectCols = aggregatePrograms
        ? `NULL::integer AS id, bl.org_id, bl.account_id, NULL::integer AS program_id, bl.grant_id,
                bl.fiscal_year, bl.month, SUM(bl.amount_cents)::bigint AS amount_cents,
                MAX(bl.created_at) AS created_at, MAX(bl.updated_at) AS updated_at`
        : `bl.id, bl.org_id, bl.account_id, bl.program_id, bl.grant_id,
                bl.fiscal_year, bl.month, bl.amount_cents, bl.created_at, bl.updated_at`;

      const groupBy = aggregatePrograms
        ? 'GROUP BY bl.org_id, bl.account_id, bl.grant_id, bl.fiscal_year, bl.month'
        : '';

      const query = `SELECT ${selectCols}
         FROM org_budget_lines bl
         WHERE ${conds.join(' AND ')}
         ${groupBy}
         ORDER BY bl.account_id ASC, bl.month ASC`;

      console.log('Budget-lines GET query:', {
        query,
        params,
        conds,
        selectCols: selectCols.substring(0, 100) + '...'
      });

      const r = await pool.query(query, params);
      const metaConds = conds.map(c => c.replace(/\bbl\./g, 'bl2.'));
      const meta = await pool.query(
        `SELECT MAX(bl2.updated_at) AS budget_lines_last_edited_at
         FROM org_budget_lines bl2
         WHERE ${metaConds.join(' AND ')}`,
        params
      );
      return res.json({
        budget_lines: r.rows.map(rowToBudgetLine),
        budget_lines_last_edited_at: meta.rows[0] && meta.rows[0].budget_lines_last_edited_at,
        aggregate_programs: aggregatePrograms,
      });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /budget-lines ERROR:', {
        message: e.message,
        code: e.code,
        detail: e.detail,
        stack: e.stack,
        params,
        conds
      });
      return res.status(500).json({ error: 'Could not load budget lines', debug: e.message });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const accountId = Number.parseInt(String(body.account_id || ''), 10);
    const programId = Number.parseInt(String(body.program_id || ''), 10);
    const fiscalYear = Number.parseInt(String(body.fiscal_year || ''), 10);
    const month = Number.parseInt(String(body.month || ''), 10);

    if (!Number.isInteger(accountId) || accountId < 1) {
      return res.status(400).json({ error: 'account_id is required' });
    }
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'program_id is required' });
    }
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be 1–12' });
    }
    const writeScope = programScopeFor(req);
    if (writeScope !== null && !writeScope.includes(programId)) {
      return res.status(403).json({ error: 'You do not have access to write budget lines for this program.' });
    }

    let grantId = null;
    if (body.grant_id !== undefined && body.grant_id !== null && String(body.grant_id).trim() !== '') {
      const g = Number.parseInt(String(body.grant_id), 10);
      if (!Number.isInteger(g) || g < 1) {
        return res.status(400).json({ error: 'grant_id invalid' });
      }
      grantId = g;
    }

    const amt = parseAmountCents(body, false);
    if (amt.error) {
      return res.status(400).json({ error: amt.error });
    }

    try {
      const acc = await pool.query(
        `SELECT id, budget_source FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [accountId, orgId]
      );
      if (acc.rows.length === 0) {
        return res.status(400).json({ error: 'Account not in this workspace' });
      }
      const { budget_source } = acc.rows[0];
      if (['personnel', 'grant_allocation'].includes(budget_source)) {
        const owner = budget_source === 'personnel' ? 'Personnel' : 'Grants';
        return res.status(403).json({
          error: `Account is owned by ${owner}. Budget lines are written automatically by that module.`,
          budget_source,
        });
      }
      const prog = await pool.query(
        `SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [programId, orgId]
      );
      if (prog.rows.length === 0) {
        return res.status(400).json({ error: 'Program not in this workspace' });
      }
      if (grantId != null) {
        const g = await pool.query(
          `SELECT id FROM org_grants WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [grantId, orgId]
        );
        if (g.rows.length === 0) {
          return res.status(400).json({ error: 'Grant not in this workspace' });
        }
      }

      const ins = await pool.query(
        `INSERT INTO org_budget_lines (
           org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents
         ) VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, org_id, account_id, program_id, grant_id, fiscal_year, month,
                   amount_cents, created_at, updated_at`,
        [orgId, accountId, programId, grantId, fiscalYear, month, amt.value]
      );
      const created = ins.rows[0];
      await logAudit(pool, {
        orgId, userId, action: 'create',
        tableName: 'org_budget_lines', recordId: created.id,
        metadata: reqMeta(req),
      });
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.status(201).json({ budget_line: rowToBudgetLine(created) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      if (e && e.code === '23505') {
        return res.status(409).json({ error: 'A budget line already exists for that account, program, grant, year, and month' });
      }
      console.error('POST /budget-lines:', e.message);
      return res.status(500).json({ error: 'Could not create budget line' });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-lines/copy-from-prior-year', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const toFY = Number.parseInt(String(body.fiscal_year || ''), 10);
    if (!Number.isInteger(toFY) || toFY < 1900 || toFY > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required' });
    }
    const fromFY = toFY - 1;
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }

      const existing = await pool.query(
        `SELECT COUNT(*)::int AS c FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = $2`,
        [orgId, toFY]
      );
      if (existing.rows[0].c > 0) {
        return res.status(409).json({ error: `Fiscal year ${toFY} already has budget lines. Manage them from the budget grid.` });
      }

      const prior = (await pool.query(
        // Only rows a user can freely edit — personnel/grant_allocation lines are
        // regenerated by their own modules, not carried forward as a manual clone.
        `SELECT * FROM org_budget_lines
         WHERE org_id = $1 AND fiscal_year = $2 AND source_type NOT IN ('personnel', 'grant_allocation')`,
        [orgId, fromFY]
      )).rows;
      if (prior.length === 0) {
        return res.json({ copied: 0 });
      }

      const client = await pool.connect();
      let copied = 0;
      try {
        await client.query('BEGIN');
        for (const bl of prior) {
          await client.query(
            `INSERT INTO org_budget_lines
               (org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents, source_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'prior_year')
             ON CONFLICT DO NOTHING`,
            [orgId, bl.account_id, bl.program_id, bl.grant_id, toFY, bl.month, bl.amount_cents]
          );
          copied++;
        }
        await client.query('COMMIT');
      } catch (e) {
        if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      await logAudit(pool, {
        orgId, userId, action: 'create',
        tableName: 'org_budget_lines', recordId: null,
        metadata: { ...reqMeta(req), from_fiscal_year: fromFY, to_fiscal_year: toFY, copied },
      });
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.json({ copied, from_fiscal_year: fromFY, to_fiscal_year: toFY });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /budget-lines/copy-from-prior-year:', e.message);
      return res.status(500).json({ error: 'Could not copy budget lines' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/budget-lines/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const amt = parseAmountCents(body, false);
    if (amt.error) {
      return res.status(400).json({ error: amt.error });
    }

    try {
      const before = await pool.query(
        `SELECT amount_cents, source_type, is_override, program_id FROM org_budget_lines WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (before.rows.length === 0) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      const { amount_cents: oldAmountCents, source_type, is_override, program_id: existingProgramId } = before.rows[0];
      const patchScope = programScopeFor(req);
      if (patchScope !== null && !patchScope.includes(existingProgramId)) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      if (['personnel', 'grant_allocation'].includes(source_type) && !is_override) {
        const owner = source_type === 'personnel' ? 'Personnel' : 'Grants';
        return res.status(403).json({
          error: `This budget line is managed by ${owner} and cannot be edited directly.`,
          source_type,
        });
      }

      const upd = await pool.query(
        `UPDATE org_budget_lines SET amount_cents = $1, updated_at = NOW()
         WHERE id = $2 AND org_id = $3
         RETURNING id, org_id, account_id, program_id, grant_id, fiscal_year, month,
                   amount_cents, created_at, updated_at`,
        [amt.value, id, orgId]
      );
      if (upd.rows.length === 0) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      await logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_budget_lines', recordId: id,
        fields: [{ fieldName: 'amount_cents', oldValue: oldAmountCents, newValue: amt.value }],
        metadata: reqMeta(req),
      });
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.json({ budget_line: rowToBudgetLine(upd.rows[0]) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('PATCH /budget-lines:', e.message);
      return res.status(500).json({ error: 'Could not update budget line' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/budget-lines/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;

    try {
      const existing = await pool.query(
        `SELECT source_type, program_id FROM org_budget_lines WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      const deleteScope = programScopeFor(req);
      if (deleteScope !== null && !deleteScope.includes(existing.rows[0].program_id)) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      const existingSourceType = existing.rows[0].source_type;
      if (['personnel', 'grant_allocation'].includes(existingSourceType)) {
        const owner = existingSourceType === 'personnel' ? 'Personnel' : 'Grants';
        return res.status(403).json({
          error: `This budget line is managed by ${owner} and cannot be deleted directly.`,
          source_type: existingSourceType,
        });
      }
      const del = await pool.query(
        `DELETE FROM org_budget_lines WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (del.rowCount === 0) {
        return res.status(404).json({ error: 'Budget line not found' });
      }
      await logAudit(pool, {
        orgId, userId, action: 'delete',
        tableName: 'org_budget_lines', recordId: id,
        metadata: reqMeta(req),
      });
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.json({ ok: true });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /budget-lines:', e.message);
      return res.status(500).json({ error: 'Could not delete budget line' });
    }
  });

}

module.exports = { registerOrganizationalBudgetLineRoutes };
