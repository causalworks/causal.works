'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { buildBudgetByProgram } = require('../lib/OrganizationalBudgetByProgram');
const { invalidateOrganizationalSummaryCache } = require('../lib/OrganizationalSummaryService');

const XERO_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Show P&L magnitudes as positive dollars (Xero P&L may store expenses negative). */
function displayPlCents(accountType, rawCents) {
  const n = Number(rawCents) || 0;
  const t = String(accountType || '').toLowerCase();
  if (t === 'expense' || t === 'income') return Math.abs(n);
  return n;
}

function ytdCalendarMonthForFiscalYear(fiscalYear) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (fiscalYear < y) return 12;
  if (fiscalYear > y) return 0;
  return m;
}

function rowToActual(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    status: row.status,
    source: row.source,
    period_year: row.period_year,
    period_month: row.period_month,
    description: row.description,
    currency_code: row.currency_code,
    amount_cents: row.amount_cents != null ? String(row.amount_cents) : '0',
    xero_tracking_option_id: row.xero_tracking_option_id || null,
    org_account_id: row.org_account_id,
    org_program_id: row.org_program_id,
    auto_matched_account: !!row.auto_matched_account,
    auto_matched_program: !!row.auto_matched_program,
    account_code: row.account_code || null,
    account_name: row.account_name || null,
    program_name: row.program_name || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function registerOrganizationalActualsRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/actuals', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const status = String(req.query.status || 'pending').toLowerCase();
    const fy = req.query.fiscal_year != null ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    const month = req.query.month != null ? Number.parseInt(String(req.query.month), 10) : null;
    const limit = Math.min(500, Math.max(1, Number.parseInt(String(req.query.limit || '200'), 10) || 200));

    try {

      const conds = ['a.org_id = $1'];
      const params = [orgId];
      let p = 2;

      if (status && status !== 'all') {
        if (!['pending', 'confirmed', 'skipped'].includes(status)) {
          return res.status(400).json({ error: 'status must be pending, confirmed, skipped, or all' });
        }
        conds.push(`a.status = $${p}::org_actual_status`);
        params.push(status);
        p += 1;
      }
      if (Number.isInteger(fy) && fy >= 1900 && fy <= 2200) {
        conds.push(`a.period_year = $${p}`);
        params.push(fy);
        p += 1;
      }
      if (Number.isInteger(month) && month >= 1 && month <= 12) {
        conds.push(`a.period_month = $${p}`);
        params.push(month);
        p += 1;
      }

      const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
      params.push(limit);

      const r = await pool.query(
        `SELECT a.id, a.org_id, a.status::text AS status, a.source,
                a.period_year, a.period_month,
                a.description, a.currency_code, a.amount_cents,
                a.xero_tracking_option_id,
                a.org_account_id, a.org_program_id, a.auto_matched_account, a.auto_matched_program,
                a.created_at, a.updated_at,
                acc.code AS account_code, acc.name AS account_name,
                pr.name AS program_name
         FROM org_actuals a
         LEFT JOIN org_accounts acc ON acc.id = a.org_account_id
         LEFT JOIN org_programs pr ON pr.id = a.org_program_id
         ${where}
         ORDER BY a.period_year DESC, a.period_month DESC, a.id DESC
         LIMIT $${p}`,
        params
      );
      return res.json({ actuals: r.rows.map(rowToActual) });
    } catch (e) {
      console.error('GET /actuals:', e.message);
      return res.status(500).json({ error: 'Could not load actuals' });
    }
  });

  app.get('/api/organizational/orgs/:slug/actuals/last-sync', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT MAX(created_at) AS last_sync_at, COUNT(*)::int AS row_count
         FROM org_actuals
         WHERE org_id = $1`,
        [orgId]
      );
      const row = r.rows[0] || {};
      return res.json({
        last_sync_at: row.last_sync_at || null,
        row_count: row.row_count != null ? Number(row.row_count) : 0,
      });
    } catch (e) {
      console.error('GET /actuals/last-sync:', e.message);
      return res.status(500).json({ error: 'Could not load actuals sync metadata' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/actuals/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid actual id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const touchAccount = Object.prototype.hasOwnProperty.call(body, 'org_account_id');
    const touchProgram = Object.prototype.hasOwnProperty.call(body, 'org_program_id');

    let coopAccountId = null;
    if (touchAccount) {
      if (body.org_account_id === null || body.org_account_id === '') {
        coopAccountId = null;
      } else {
        const n = Number.parseInt(String(body.org_account_id), 10);
        if (!Number.isInteger(n) || n < 1) {
          return res.status(400).json({ error: 'org_account_id invalid' });
        }
        coopAccountId = n;
      }
    }

    let coopProgramId = null;
    if (touchProgram) {
      if (body.org_program_id === null || body.org_program_id === '') {
        coopProgramId = null;
      } else {
        const n = Number.parseInt(String(body.org_program_id), 10);
        if (!Number.isInteger(n) || n < 1) {
          return res.status(400).json({ error: 'org_program_id invalid' });
        }
        coopProgramId = n;
      }
    }

    let newStatus = undefined;
    if (body.status !== undefined && body.status !== null && body.status !== '') {
      const s = String(body.status).toLowerCase();
      if (!['pending', 'confirmed', 'skipped'].includes(s)) {
        return res.status(400).json({ error: 'status invalid' });
      }
      newStatus = s;
    }

    try {
      const cur = await pool.query(
        `SELECT * FROM org_actuals WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, orgId]
      );
      if (cur.rows.length === 0) {
        return res.status(404).json({ error: 'Actual not found' });
      }

      if (touchAccount && coopAccountId != null) {
        const a = await pool.query(
          `SELECT id FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [coopAccountId, orgId]
        );
        if (a.rows.length === 0) {
          return res.status(400).json({ error: 'Account not in this workspace' });
        }
      }

      if (touchProgram && coopProgramId != null) {
        const p = await pool.query(
          `SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
          [coopProgramId, orgId]
        );
        if (p.rows.length === 0) {
          return res.status(400).json({ error: 'Program not in this workspace' });
        }
      }

      let acc = cur.rows[0].org_account_id;
      let prog = cur.rows[0].org_program_id;
      let st = cur.rows[0].status;
      if (touchAccount) acc = coopAccountId;
      if (touchProgram) prog = coopProgramId;
      if (newStatus !== undefined) st = newStatus;

      if (String(st) === 'confirmed' && (acc == null || prog == null)) {
        return res
          .status(400)
          .json({ error: 'org_account_id and org_program_id must be set before confirming' });
      }

      await pool.query(
        `UPDATE org_actuals SET
           org_account_id = $1,
           org_program_id = $2,
           status = $3::org_actual_status,
           auto_matched_account = CASE WHEN $4 THEN FALSE ELSE auto_matched_account END,
           auto_matched_program = CASE WHEN $5 THEN FALSE ELSE auto_matched_program END,
           updated_at = NOW()
         WHERE id = $6 AND org_id = $7`,
        [acc, prog, st, touchAccount, touchProgram, id, orgId]
      );

      const j = await pool.query(
        `SELECT a.id, a.org_id, a.status::text AS status, a.source,
                a.period_year, a.period_month,
                a.description, a.currency_code, a.amount_cents,
                a.xero_tracking_option_id,
                a.org_account_id, a.org_program_id, a.auto_matched_account, a.auto_matched_program,
                a.created_at, a.updated_at,
                acc.code AS account_code, acc.name AS account_name, pr.name AS program_name
         FROM org_actuals a
         LEFT JOIN org_accounts acc ON acc.id = a.org_account_id
         LEFT JOIN org_programs pr ON pr.id = a.org_program_id
         WHERE a.id = $1 LIMIT 1`,
        [id]
      );
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.json({ actual: rowToActual(j.rows[0]) });
    } catch (e) {
      console.error('PATCH /actuals:', e.message);
      return res.status(500).json({ error: 'Could not update actual' });
    }
  });

  app.post('/api/organizational/orgs/:slug/actuals/confirm-ready', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `UPDATE org_actuals SET status = 'confirmed'::org_actual_status, updated_at = NOW()
         WHERE org_id = $1 AND status = 'pending'::org_actual_status
           AND org_account_id IS NOT NULL AND org_program_id IS NOT NULL`,
        [orgId]
      );
      if (r.rowCount > 0) {
        await invalidateOrganizationalSummaryCache(pool, orgId);
      }
      return res.json({ confirmed: r.rowCount });
    } catch (e) {
      console.error('POST /actuals/confirm-ready:', e.message);
      return res.status(500).json({ error: 'Could not confirm actuals' });
    }
  });

  app.get('/api/organizational/orgs/:slug/reports/budget-vs-actual', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required (e.g. 2024)' });
    }

    const programRaw = req.query.program_id;
    const programAll =
      programRaw === undefined ||
      programRaw === null ||
      String(programRaw).trim() === '' ||
      String(programRaw).toLowerCase() === 'all';
    let programIds = [];
    if (!programAll) {
      programIds = String(programRaw).split(',').map(s => Number.parseInt(s.trim(), 10));
      if (programIds.some(id => !Number.isInteger(id) || id < 1)) {
        return res.status(400).json({ error: 'program_id must be positive integer(s) or "all"' });
      }
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

    const ytdThrough = ytdCalendarMonthForFiscalYear(fy);

    try {

      const accR = await pool.query(
        `WITH RECURSIVE roots AS (
           SELECT id FROM org_accounts
           WHERE org_id = $1 AND code IN ('_H1_REV', '_H1_INC', '_H1_EXP')
         ),
         tr AS (
           SELECT id FROM roots
           UNION ALL
           SELECT a.id FROM org_accounts a
           INNER JOIN tr ON a.parent_id = tr.id
           WHERE a.org_id = $1
         )
         SELECT a.id, a.code, a.name, a.type::text AS type, a.parent_id, a.level, a.is_posting, a.budget_source
         FROM org_accounts a
         WHERE a.org_id = $1
           AND (
             (EXISTS (SELECT 1 FROM roots) AND a.id IN (SELECT id FROM tr))
             OR (NOT EXISTS (SELECT 1 FROM roots) AND a.type IN ('income'::org_account_type, 'expense'::org_account_type))
           )
         ORDER BY lower(a.code) ASC, a.id ASC`,
        [orgId]
      );
      const accounts = accR.rows;

      const budConds = ['bl.org_id = $1', 'bl.fiscal_year = $2'];
      const budParams = [orgId, fy];
      let bp = 3;
      if (!programAll) {
        budConds.push(`bl.program_id = ANY($${bp}::int[])`);
        budParams.push(programIds);
        bp += 1;
      }
      if (filterGrant) {
        budConds.push(`bl.grant_id = $${bp}`);
        budParams.push(grantId);
        bp += 1;
      } else if (unscoped) {
        // Only filter for unscoped if explicitly requested
        budConds.push('bl.grant_id IS NULL');
      }
      // If neither grant_id nor unscoped is specified, include all budget lines

      const budR = await pool.query(
        `SELECT bl.account_id, bl.month,
                SUM(bl.amount_cents)::bigint AS budget_cents,
                BOOL_OR(COALESCE(bl.is_override, FALSE)) AS has_override,
                MAX(bl.source_updated_at) AS source_updated_at,
                MAX(bl.updated_at) AS line_updated_at,
                CASE WHEN COUNT(DISTINCT COALESCE(bl.source_type, 'manual')) = 1
                     THEN MIN(COALESCE(bl.source_type, 'manual'))
                     ELSE 'mixed' END AS source_type
         FROM org_budget_lines bl
         WHERE ${budConds.join(' AND ')}
         GROUP BY bl.account_id, bl.month`,
        budParams
      );

      const actConds = [
        'a.org_id = $1',
        'a.period_year = $2',
        `a.status = 'confirmed'::org_actual_status`,
        'a.org_account_id IS NOT NULL',
      ];
      const actParams = [orgId, fy];
      let ap = 3;
      if (!programAll) {
        actConds.push(`a.org_program_id = ANY($${ap}::int[])`);
        actParams.push(programIds);
        ap += 1;
      }

      const actR = await pool.query(
        `SELECT a.org_account_id AS account_id, a.period_month AS month, SUM(a.amount_cents)::bigint AS actual_cents
         FROM org_actuals a
         WHERE ${actConds.join(' AND ')}
         GROUP BY a.org_account_id, a.period_month`,
        actParams
      );

      let unallocated = [];
      if (programAll) {
        const uR = await pool.query(
          `SELECT st.id AS parent_subtotal_id,
                  st.type::text AS subtotal_type,
                  COALESCE(SUM(a.amount_cents), 0)::bigint AS ytd_raw
           FROM org_actuals a
           INNER JOIN org_accounts leaf ON leaf.id = a.org_account_id
             AND leaf.is_posting = TRUE AND leaf.level = 3
           INNER JOIN org_accounts st ON st.id = leaf.parent_id AND st.is_posting = FALSE
           WHERE a.org_id = $1
             AND a.period_year = $2
             AND a.status = 'confirmed'::org_actual_status
             AND a.org_program_id IS NULL
             AND a.period_month >= 1
             AND a.period_month <= $3
           GROUP BY st.id, st.type`,
          [orgId, fy, ytdThrough]
        );
        unallocated = uR.rows.map((row) => ({
          parent_subtotal_id: row.parent_subtotal_id,
          ytd_actual_cents: String(displayPlCents(row.subtotal_type, row.ytd_raw)),
        }));
      }

      const budgetByAccMonth = new Map();
      const budgetStateByAccMonth = new Map();
      for (const row of budR.rows) {
        const k = `${row.account_id}-${row.month}`;
        budgetByAccMonth.set(k, Number(row.budget_cents) || 0);
        budgetStateByAccMonth.set(k, {
          source_type: row.source_type || 'manual',
          has_override: Boolean(row.has_override),
          source_updated_at: row.source_updated_at || null,
          line_updated_at: row.line_updated_at || null,
        });
      }

      const actualByAccMonth = new Map();
      for (const row of actR.rows) {
        const k = `${row.account_id}-${row.month}`;
        actualByAccMonth.set(k, (actualByAccMonth.get(k) || 0) + (Number(row.actual_cents) || 0));
      }

      const lines = [];
      for (const acc of accounts) {
        if (!acc.is_posting) continue;
        const t = String(acc.type || '').toLowerCase();
        const monthlyBudget = [];
        const monthlyActual = [];
        const monthlyCellState = [];
        let approved = 0;
        let ytdActualRaw = 0;
        let remainingBudget = 0;
        for (let m = 1; m <= 12; m += 1) {
          const b = budgetByAccMonth.get(`${acc.id}-${m}`) || 0;
          const ar = actualByAccMonth.get(`${acc.id}-${m}`) || 0;
          const bd = displayPlCents(t, b);
          const ad = displayPlCents(t, ar);
          monthlyBudget.push(bd);
          monthlyActual.push(ad);
          monthlyCellState.push(budgetStateByAccMonth.get(`${acc.id}-${m}`) || null);
          approved += bd;
          if (m <= ytdThrough) ytdActualRaw += ar;
          if (m > ytdThrough) remainingBudget += bd;
        }
        const ytdActual = displayPlCents(t, ytdActualRaw);
        const projected = ytdActual + remainingBudget;

        let variance_class = null;
        if (approved > 0 && ytdThrough > 0) {
          const ratio = ytdActual / approved;
          if (t === 'expense') {
            if (ratio > 1.1) variance_class = 'warn';
            else if (ratio < 0.9) variance_class = 'good';
          } else if (t === 'income') {
            if (ratio < 0.9) variance_class = 'warn';
            else if (ratio > 1.1) variance_class = 'good';
          }
        }

        lines.push({
          account_id: acc.id,
          code: acc.code,
          name: acc.name,
          type: acc.type,
          parent_id: acc.parent_id,
          level: acc.level,
          is_posting: acc.is_posting,
          approved_cents: String(approved),
          ytd_actual_cents: String(ytdActual),
          projected_cents: String(projected),
          monthly_budget_cents: monthlyBudget.map((n) => String(Math.round(n))),
          monthly_actual_cents: monthlyActual.map((n) => String(Math.round(n))),
          monthly_cell_state: monthlyCellState,
          variance_class: variance_class,
        });
      }

      // Detect true duplicate budget lines: same (account, program, grant, month).
      // Grouping by account+month alone is too broad — multiple programs on the
      // same account legitimately produce multiple rows per month.
      const dupR = await pool.query(
        `SELECT bl.account_id, bl.program_id, bl.grant_id, bl.month, COUNT(*) AS line_count
         FROM org_budget_lines bl
         WHERE ${budConds.join(' AND ')}
         GROUP BY bl.account_id, bl.program_id, bl.grant_id, bl.month
         HAVING COUNT(*) > 1`,
        budParams
      );
      const data_warnings = dupR.rows.length > 0
        ? [{
            code: 'duplicate_budget_lines',
            message: `${dupR.rows.length} account-month slot(s) have multiple budget lines — totals may be inflated. Run "Fix math" to recalculate.`,
          }]
        : [];

      return res.json({
        fiscal_year: fy,
        ytd_through_month: ytdThrough,
        program_all: programAll,
        program_id: programAll ? null : (programIds.length === 1 ? programIds[0] : programIds),
        accounts: accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          parent_id: a.parent_id,
          level: a.level,
          is_posting: a.is_posting,
          budget_source: a.budget_source || 'schedule',
        })),
        lines,
        unallocated_by_subtotal: unallocated,
        data_warnings,
      });
    } catch (e) {
      console.error('GET /reports/budget-vs-actual:', e.message);
      return res.status(500).json({ error: 'Could not build report' });
    }
  });

  app.get('/api/organizational/orgs/:slug/reports/budget-by-program', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required (e.g. 2026)' });
    }

    let programIds = null;
    const programsRaw = req.query.programs;
    if (programsRaw !== undefined && programsRaw !== null && String(programsRaw).trim() !== '') {
      programIds = String(programsRaw)
        .split(',')
        .map((s) => Number.parseInt(String(s).trim(), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (programIds.length === 0) {
        return res.status(400).json({ error: 'programs must be a comma-separated list of positive integers' });
      }
    }

    try {
      const payload = await buildBudgetByProgram(pool, {
        orgId,
        fiscalYear: fy,
        programIds,
      });
      return res.json(payload);
    } catch (e) {
      console.error('GET /reports/budget-by-program:', e.message);
      return res.status(500).json({ error: 'Could not build report' });
    }
  });

  app.get('/api/organizational/orgs/:slug/tracking-program-maps', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT m.id, m.xero_tracking_category_id, m.xero_tracking_option_id, m.dimension, m.coop_program_id,
                p.name AS program_name
         FROM org_xero_program_track_map m
         INNER JOIN org_programs p ON p.id = m.coop_program_id
         WHERE m.org_id = $1
         ORDER BY m.id ASC`,
        [orgId]
      );
      return res.json({ maps: r.rows });
    } catch (e) {
      console.error('GET /tracking-program-maps:', e.message);
      return res.status(500).json({ error: 'Could not load maps' });
    }
  });

  app.post('/api/organizational/orgs/:slug/tracking-program-map', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const catId = String(body.tracking_category_id || '').trim().toLowerCase();
    const optId = String(body.tracking_option_id || '').trim().toLowerCase();
    const progRaw = body.coop_program_id;

    if (!XERO_GUID.test(catId) || !XERO_GUID.test(optId)) {
      return res.status(400).json({ error: 'tracking_category_id and tracking_option_id must be GUIDs' });
    }

    try {

      if (progRaw === null || progRaw === undefined || progRaw === '') {
        const d = await pool.query(
          `DELETE FROM org_xero_program_track_map
           WHERE org_id = $1 AND lower(trim(xero_tracking_category_id)) = $2
             AND lower(trim(xero_tracking_option_id)) = $3`,
          [orgId, catId, optId]
        );
        return res.json({ deleted: d.rowCount });
      }

      const coopProgramId = Number.parseInt(String(progRaw), 10);
      if (!Number.isInteger(coopProgramId) || coopProgramId < 1) {
        return res.status(400).json({ error: 'coop_program_id invalid' });
      }

      const p = await pool.query(
        `SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [coopProgramId, orgId]
      );
      if (p.rows.length === 0) {
        return res.status(400).json({ error: 'Program not in this workspace' });
      }

      const ins = await pool.query(
        `INSERT INTO org_xero_program_track_map (
           org_id, xero_tracking_category_id, xero_tracking_option_id, dimension, coop_program_id
         ) VALUES ($1, $2, $3, 'activity', $4)
         ON CONFLICT (org_id, xero_tracking_category_id, xero_tracking_option_id, dimension)
         DO UPDATE SET coop_program_id = EXCLUDED.coop_program_id, updated_at = NOW()
         RETURNING id, xero_tracking_category_id, xero_tracking_option_id, dimension, coop_program_id`,
        [orgId, catId, optId, coopProgramId]
      );
      return res.json({ map: ins.rows[0] });
    } catch (e) {
      console.error('POST /tracking-program-map:', e.message);
      return res.status(500).json({ error: 'Could not save map' });
    }
  });

  app.put('/api/organizational/orgs/:slug/tracking-program-map', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const categoryDimensions =
      body.category_dimensions && typeof body.category_dimensions === 'object' && !Array.isArray(body.category_dimensions)
        ? body.category_dimensions
        : {};
    const mappings = Array.isArray(body.mappings) ? body.mappings : [];

    const normalizedCategoryDimensions = {};
    for (const rawCatId of Object.keys(categoryDimensions)) {
      const catId = String(rawCatId || '').trim().toLowerCase();
      if (!XERO_GUID.test(catId)) {
        return res.status(400).json({ error: 'category_dimensions keys must be GUIDs' });
      }
      const dim = String(categoryDimensions[rawCatId] || '')
        .trim()
        .toLowerCase();
      if (dim !== 'program' && dim !== 'activity') {
        return res.status(400).json({ error: 'category_dimensions values must be program or activity' });
      }
      normalizedCategoryDimensions[catId] = dim;
    }

    const normalizedMappings = [];
    for (const m of mappings) {
      const catId = String(m && m.xero_tracking_category_id ? m.xero_tracking_category_id : '')
        .trim()
        .toLowerCase();
      const optId = String(m && m.xero_tracking_option_id ? m.xero_tracking_option_id : '')
        .trim()
        .toLowerCase();
      const dim = String(m && m.dimension ? m.dimension : '')
        .trim()
        .toLowerCase();
      if (!XERO_GUID.test(catId) || !XERO_GUID.test(optId)) {
        return res.status(400).json({ error: 'Each mapping requires GUID category/option ids' });
      }
      if (dim !== 'program' && dim !== 'activity') {
        return res.status(400).json({ error: 'Each mapping dimension must be program or activity' });
      }
      if (!normalizedCategoryDimensions[catId]) {
        return res.status(400).json({ error: 'Each mapping category must be present in category_dimensions' });
      }
      if (normalizedCategoryDimensions[catId] !== dim) {
        return res.status(400).json({ error: 'Mapping dimension must match category_dimensions for its category' });
      }

      let coopProgramId = null;
      if (m && m.coop_program_id !== undefined && m.coop_program_id !== null && m.coop_program_id !== '') {
        coopProgramId = Number.parseInt(String(m.coop_program_id), 10);
        if (!Number.isInteger(coopProgramId) || coopProgramId < 1) {
          return res.status(400).json({ error: 'coop_program_id must be a positive integer or null' });
        }
      }
      normalizedMappings.push({
        xero_tracking_category_id: catId,
        xero_tracking_option_id: optId,
        dimension: dim,
        coop_program_id: coopProgramId,
      });
    }

    const client = await pool.connect();
    try {

      const idsToValidate = Array.from(
        new Set(
          normalizedMappings
            .map((m) => m.coop_program_id)
            .filter((id) => Number.isInteger(id))
        )
      );
      if (idsToValidate.length) {
        const v = await client.query(
          `SELECT id FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`,
          [orgId, idsToValidate]
        );
        const valid = new Set(v.rows.map((r) => r.id));
        const bad = idsToValidate.find((id) => !valid.has(id));
        if (bad != null) {
          return res.status(400).json({ error: `coop_program_id ${bad} is not in this workspace` });
        }
      }

      await client.query('BEGIN');
      let upserted = 0;
      let deleted = 0;
      for (const m of normalizedMappings) {
        if (m.coop_program_id == null) {
          const d = await client.query(
            `DELETE FROM org_xero_program_track_map
             WHERE org_id = $1
               AND lower(trim(xero_tracking_category_id)) = $2
               AND lower(trim(xero_tracking_option_id)) = $3
               AND dimension = $4`,
            [orgId, m.xero_tracking_category_id, m.xero_tracking_option_id, m.dimension]
          );
          deleted += d.rowCount || 0;
          continue;
        }
        const u = await client.query(
          `INSERT INTO org_xero_program_track_map (
             org_id, xero_tracking_category_id, xero_tracking_option_id, dimension, coop_program_id
           ) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (org_id, xero_tracking_category_id, xero_tracking_option_id, dimension)
           DO UPDATE SET coop_program_id = EXCLUDED.coop_program_id, updated_at = NOW()`,
          [orgId, m.xero_tracking_category_id, m.xero_tracking_option_id, m.dimension, m.coop_program_id]
        );
        upserted += u.rowCount || 0;
      }
      await client.query('COMMIT');
      return res.json({
        ok: true,
        upserted,
        deleted,
        category_dimensions: normalizedCategoryDimensions,
      });
    } catch (e) {
      try {
        await client.query('ROLLBACK');
      } catch (_) {}
      console.error('PUT /tracking-program-map:', e.message);
      return res.status(500).json({ error: 'Could not save mapping set' });
    } finally {
      client.release();
    }
  });
}

module.exports = { registerOrganizationalActualsRoutes };
