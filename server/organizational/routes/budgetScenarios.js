'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { invalidateOrganizationalSummaryCache } = require('../lib/OrganizationalSummaryService');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { scenarioHasForkedInputs, forkScenarioInputs, promoteScenarioInputs } = require('../lib/scenarioFork');
const { recalcPersonnelBudget } = require('../lib/personnelRecalc');
const { recalcScheduleItems } = require('../lib/scheduleRecalc');
const { recalcGrantBudget } = require('../lib/grantRecalc');

async function requireAdminRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  const role = String((r.rows[0] && r.rows[0].role) || '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function rowToScenario(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    org_id: row.org_id,
    fiscal_year: row.fiscal_year,
    name: row.name,
    description: row.description,
    status: row.status,
    scenario_type: row.scenario_type,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToScenarioLine(row) {
  if (!row) return null;
  const c = row.amount_cents != null ? Number(row.amount_cents) : 0;
  return {
    id: Number(row.id),
    scenario_id: Number(row.scenario_id),
    account_id: row.account_id,
    program_id: row.program_id,
    grant_id: row.grant_id,
    month: row.month,
    amount_cents: c,
    amount_dollars: Math.round(c) / 100,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function loadScenario(pool, orgId, scenarioId) {
  const r = await pool.query(
    `SELECT * FROM org_budget_scenarios WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [scenarioId, orgId]
  );
  return r.rows[0] || null;
}

function parseAmountCents(body) {
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
  return { error: 'amount is required' };
}

function registerBudgetScenarioRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // ---- Scenario CRUD ----

  app.get('/api/organizational/orgs/:slug/budget-scenarios', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fyRaw = req.query.fiscal_year;
    const conds = ['org_id = $1'];
    const params = [orgId];
    if (fyRaw !== undefined && fyRaw !== null && String(fyRaw).trim() !== '') {
      const fy = Number.parseInt(String(fyRaw), 10);
      if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
        return res.status(400).json({ error: 'fiscal_year invalid' });
      }
      conds.push(`fiscal_year = $${params.length + 1}`);
      params.push(fy);
    }
    try {
      const r = await pool.query(
        `SELECT * FROM org_budget_scenarios WHERE ${conds.join(' AND ')} ORDER BY fiscal_year DESC, created_at DESC`,
        params
      );
      return res.json({ scenarios: r.rows.map(rowToScenario) });
    } catch (e) {
      console.error('GET /budget-scenarios:', e.message);
      return res.status(500).json({ error: 'Could not load scenarios' });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-scenarios', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const fiscalYear = Number.parseInt(String(body.fiscal_year || ''), 10);
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
      return res.status(400).json({ error: 'fiscal_year is required' });
    }
    const name = String(body.name || '').trim();
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }
    const description = body.description != null ? String(body.description) : null;
    const scenarioType = ['overlay', 'detailed'].includes(body.scenario_type) ? body.scenario_type : 'overlay';

    try {
      const activeCount = await pool.query(
        `SELECT COUNT(*)::int AS c FROM org_budget_scenarios
         WHERE org_id = $1 AND fiscal_year = $2 AND status = 'draft'`,
        [orgId, fiscalYear]
      );
      if (activeCount.rows[0].c >= 5) {
        return res.status(409).json({
          error: 'This fiscal year already has 5 active scenarios. Archive or delete one before creating another.',
        });
      }

      const ins = await pool.query(
        `INSERT INTO org_budget_scenarios (org_id, fiscal_year, name, description, created_by, scenario_type)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [orgId, fiscalYear, name, description, userId, scenarioType]
      );
      const created = ins.rows[0];
      await logAudit(pool, {
        orgId, userId, action: 'create',
        tableName: 'org_budget_scenarios', recordId: created.id,
        metadata: reqMeta(req),
      });
      return res.status(201).json({ scenario: rowToScenario(created) });
    } catch (e) {
      console.error('POST /budget-scenarios:', e.message);
      return res.status(500).json({ error: 'Could not create scenario' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/budget-scenarios/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const fields = [];
    const params = [];
    let p = 1;
    if (body.name !== undefined) {
      const name = String(body.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name cannot be empty' });
      fields.push(`name = $${p}`); params.push(name); p += 1;
    }
    if (body.description !== undefined) {
      fields.push(`description = $${p}`); params.push(body.description != null ? String(body.description) : null); p += 1;
    }
    if (body.status !== undefined) {
      const status = String(body.status || '');
      if (!['draft', 'archived'].includes(status)) {
        return res.status(400).json({ error: 'status must be draft or archived' });
      }
      fields.push(`status = $${p}`); params.push(status); p += 1;
    }
    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    fields.push('updated_at = NOW()');
    params.push(id, orgId);

    try {
      const upd = await pool.query(
        `UPDATE org_budget_scenarios SET ${fields.join(', ')}
         WHERE id = $${p} AND org_id = $${p + 1}
         RETURNING *`,
        params
      );
      if (upd.rows.length === 0) {
        return res.status(404).json({ error: 'Scenario not found' });
      }
      await logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_budget_scenarios', recordId: id,
        metadata: reqMeta(req),
      });
      return res.json({ scenario: rowToScenario(upd.rows[0]) });
    } catch (e) {
      console.error('PATCH /budget-scenarios:', e.message);
      return res.status(500).json({ error: 'Could not update scenario' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/budget-scenarios/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const id = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;

    try {
      const del = await pool.query(
        `DELETE FROM org_budget_scenarios WHERE id = $1 AND org_id = $2`,
        [id, orgId]
      );
      if (del.rowCount === 0) {
        return res.status(404).json({ error: 'Scenario not found' });
      }
      await logAudit(pool, {
        orgId, userId, action: 'delete',
        tableName: 'org_budget_scenarios', recordId: id,
        metadata: reqMeta(req),
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /budget-scenarios:', e.message);
      return res.status(500).json({ error: 'Could not delete scenario' });
    }
  });

  // ---- Scenario override lines ----

  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const r = await pool.query(
        `SELECT * FROM org_budget_scenario_lines WHERE scenario_id = $1 ORDER BY account_id, month`,
        [scenarioId]
      );
      return res.json({ scenario_lines: r.rows.map(rowToScenarioLine) });
    } catch (e) {
      console.error('GET /budget-scenarios/:id/lines:', e.message);
      return res.status(500).json({ error: 'Could not load scenario lines' });
    }
  });

  // Diff view: every cell touched by either the live budget or this scenario's overrides,
  // baseline vs. scenario amount side by side. See scenario-budgeting spec, "Compare".
  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/compare', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const r = await pool.query(
        `SELECT
           COALESCE(bl.account_id, sl.account_id) AS account_id,
           COALESCE(bl.program_id, sl.program_id) AS program_id,
           COALESCE(bl.grant_id, sl.grant_id) AS grant_id,
           COALESCE(bl.month, sl.month) AS month,
           COALESCE(bl.amount_cents, 0)::bigint AS baseline_amount_cents,
           COALESCE(sl.amount_cents, bl.amount_cents, 0)::bigint AS scenario_amount_cents,
           (sl.id IS NOT NULL) AS overridden
         FROM (
           SELECT * FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = $2
         ) bl
         FULL OUTER JOIN org_budget_scenario_lines sl
           ON sl.scenario_id = $3
           AND sl.account_id = bl.account_id
           AND COALESCE(sl.program_id, -1) = COALESCE(bl.program_id, -1)
           AND COALESCE(sl.grant_id, -1) = COALESCE(bl.grant_id, -1)
           AND sl.month = bl.month
         ORDER BY account_id, month`,
        [orgId, scenario.fiscal_year, scenarioId]
      );

      const rows = r.rows.map((row) => {
        const baseline = Number(row.baseline_amount_cents);
        const withScenario = Number(row.scenario_amount_cents);
        return {
          account_id: row.account_id,
          program_id: row.program_id,
          grant_id: row.grant_id,
          month: row.month,
          baseline_amount_cents: baseline,
          scenario_amount_cents: withScenario,
          variance_cents: withScenario - baseline,
          overridden: row.overridden,
        };
      });
      return res.json({ scenario: rowToScenario(scenario), rows });
    } catch (e) {
      console.error('GET /budget-scenarios/:id/compare:', e.message);
      return res.status(500).json({ error: 'Could not build comparison' });
    }
  });

  // "What if" bottom-line: overall revenue/expense/net totals plus a per-program breakdown,
  // baseline vs. scenario vs. variance. Same underlying join as /compare, aggregated server-side
  // so the frontend's primary view doesn't have to sum hundreds of line rows itself.
  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const r = await pool.query(
        `SELECT
           COALESCE(bl.program_id, sl.program_id) AS program_id,
           oa.type AS account_type,
           COALESCE(bl.amount_cents, 0)::bigint AS baseline_amount_cents,
           COALESCE(sl.amount_cents, bl.amount_cents, 0)::bigint AS scenario_amount_cents
         FROM (
           SELECT * FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = $2
         ) bl
         FULL OUTER JOIN org_budget_scenario_lines sl
           ON sl.scenario_id = $3
           AND sl.account_id = bl.account_id
           AND COALESCE(sl.program_id, -1) = COALESCE(bl.program_id, -1)
           AND COALESCE(sl.grant_id, -1) = COALESCE(bl.grant_id, -1)
           AND sl.month = bl.month
         JOIN org_accounts oa ON oa.id = COALESCE(bl.account_id, sl.account_id)`,
        [orgId, scenario.fiscal_year, scenarioId]
      );

      const programsById = new Map(
        (await pool.query(`SELECT id, name FROM org_programs WHERE org_id = $1`, [orgId])).rows
          .map((p) => [p.id, p.name])
      );

      let baselineRevenue = 0, scenarioRevenue = 0, baselineExpense = 0, scenarioExpense = 0;
      const byProgram = new Map();
      for (const row of r.rows) {
        const baseline = Number(row.baseline_amount_cents);
        const withScenario = Number(row.scenario_amount_cents);
        const isRevenue = row.account_type === 'income';
        if (isRevenue) { baselineRevenue += baseline; scenarioRevenue += withScenario; }
        else { baselineExpense += baseline; scenarioExpense += withScenario; }

        const pid = row.program_id;
        const key = pid == null ? 'null' : String(pid);
        if (!byProgram.has(key)) {
          byProgram.set(key, {
            program_id: pid,
            program_name: pid == null ? 'Unassigned' : (programsById.get(pid) || ('#' + pid)),
            baseline_revenue_cents: 0, scenario_revenue_cents: 0,
            baseline_expense_cents: 0, scenario_expense_cents: 0,
          });
        }
        const p = byProgram.get(key);
        if (isRevenue) { p.baseline_revenue_cents += baseline; p.scenario_revenue_cents += withScenario; }
        else { p.baseline_expense_cents += baseline; p.scenario_expense_cents += withScenario; }
      }

      const programs = [...byProgram.values()].map((p) => {
        const baselineNet = p.baseline_revenue_cents - p.baseline_expense_cents;
        const scenarioNet = p.scenario_revenue_cents - p.scenario_expense_cents;
        return { ...p, baseline_net_cents: baselineNet, scenario_net_cents: scenarioNet, variance_cents: scenarioNet - baselineNet };
      }).sort((a, b) => Math.abs(b.variance_cents) - Math.abs(a.variance_cents));

      const baselineNet = baselineRevenue - baselineExpense;
      const scenarioNet = scenarioRevenue - scenarioExpense;

      return res.json({
        scenario: rowToScenario(scenario),
        totals: {
          baseline_revenue_cents: baselineRevenue, scenario_revenue_cents: scenarioRevenue,
          revenue_variance_cents: scenarioRevenue - baselineRevenue,
          baseline_expense_cents: baselineExpense, scenario_expense_cents: scenarioExpense,
          expense_variance_cents: scenarioExpense - baselineExpense,
          baseline_net_cents: baselineNet, scenario_net_cents: scenarioNet,
          net_variance_cents: scenarioNet - baselineNet,
        },
        programs,
      });
    } catch (e) {
      console.error('GET /budget-scenarios/:id/summary:', e.message);
      return res.status(500).json({ error: 'Could not build summary' });
    }
  });

  // Set (or clear, if the value now matches baseline) an override cell.
  app.put('/api/organizational/orgs/:slug/budget-scenarios/:id/lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    const accountId = Number.parseInt(String(body.account_id || ''), 10);
    const programId = Number.parseInt(String(body.program_id || ''), 10);
    const month = Number.parseInt(String(body.month || ''), 10);
    if (!Number.isInteger(accountId) || accountId < 1) {
      return res.status(400).json({ error: 'account_id is required' });
    }
    if (!Number.isInteger(programId) || programId < 1) {
      return res.status(400).json({ error: 'program_id is required' });
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      return res.status(400).json({ error: 'month must be 1–12' });
    }
    let grantId = null;
    if (body.grant_id !== undefined && body.grant_id !== null && String(body.grant_id).trim() !== '') {
      const g = Number.parseInt(String(body.grant_id), 10);
      if (!Number.isInteger(g) || g < 1) return res.status(400).json({ error: 'grant_id invalid' });
      grantId = g;
    }
    const amt = parseAmountCents(body);
    if (amt.error) return res.status(400).json({ error: amt.error });

    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const acc = await pool.query(`SELECT id FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`, [accountId, orgId]);
      if (acc.rows.length === 0) return res.status(400).json({ error: 'Account not in this workspace' });
      const prog = await pool.query(`SELECT id FROM org_programs WHERE id = $1 AND org_id = $2 LIMIT 1`, [programId, orgId]);
      if (prog.rows.length === 0) return res.status(400).json({ error: 'Program not in this workspace' });
      if (grantId != null) {
        const g = await pool.query(`SELECT id FROM org_grants WHERE id = $1 AND org_id = $2 LIMIT 1`, [grantId, orgId]);
        if (g.rows.length === 0) return res.status(400).json({ error: 'Grant not in this workspace' });
      }

      const baseline = await pool.query(
        `SELECT amount_cents FROM org_budget_lines
         WHERE org_id = $1 AND fiscal_year = $2 AND account_id = $3 AND program_id = $4
           AND COALESCE(grant_id, -1) = COALESCE($5::integer, -1) AND month = $6`,
        [orgId, scenario.fiscal_year, accountId, programId, grantId, month]
      );
      const baselineCents = baseline.rows.length ? Number(baseline.rows[0].amount_cents) : 0;

      if (amt.value === baselineCents) {
        // Value now matches the live budget -- clear the override rather than store a no-op diff.
        await pool.query(
          `DELETE FROM org_budget_scenario_lines
           WHERE scenario_id = $1 AND account_id = $2 AND program_id = $3
             AND COALESCE(grant_id, -1) = COALESCE($4::integer, -1) AND month = $5`,
          [scenarioId, accountId, programId, grantId, month]
        );
        return res.json({
          scenario_line: null,
          baseline_amount_cents: baselineCents,
          scenario_amount_cents: baselineCents,
          overridden: false,
        });
      }

      const ups = await pool.query(
        `INSERT INTO org_budget_scenario_lines (scenario_id, account_id, program_id, grant_id, month, amount_cents)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (scenario_id, account_id, COALESCE(program_id, -1), COALESCE(grant_id, -1), month)
         DO UPDATE SET amount_cents = EXCLUDED.amount_cents, updated_at = NOW()
         RETURNING *`,
        [scenarioId, accountId, programId, grantId, month, amt.value]
      );
      await logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_budget_scenario_lines', recordId: ups.rows[0].id,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({
        scenario_line: rowToScenarioLine(ups.rows[0]),
        baseline_amount_cents: baselineCents,
        scenario_amount_cents: amt.value,
        overridden: true,
      });
    } catch (e) {
      console.error('PUT /budget-scenarios/:id/lines:', e.message);
      return res.status(500).json({ error: 'Could not set scenario line' });
    }
  });

  // Explicitly revert a cell to the live baseline value (delete the override, if any).
  app.delete('/api/organizational/orgs/:slug/budget-scenarios/:id/lines', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const q = req.query || {};
    const accountId = Number.parseInt(String(q.account_id || ''), 10);
    const programId = Number.parseInt(String(q.program_id || ''), 10);
    const month = Number.parseInt(String(q.month || ''), 10);
    if (!Number.isInteger(accountId) || !Number.isInteger(programId) || !Number.isInteger(month)) {
      return res.status(400).json({ error: 'account_id, program_id, and month are required' });
    }
    let grantId = null;
    if (q.grant_id !== undefined && q.grant_id !== null && String(q.grant_id).trim() !== '') {
      const g = Number.parseInt(String(q.grant_id), 10);
      if (Number.isInteger(g)) grantId = g;
    }

    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      await pool.query(
        `DELETE FROM org_budget_scenario_lines
         WHERE scenario_id = $1 AND account_id = $2 AND program_id = $3
           AND COALESCE(grant_id, -1) = COALESCE($4::integer, -1) AND month = $5`,
        [scenarioId, accountId, programId, grantId, month]
      );
      await logAudit(pool, {
        orgId, userId, action: 'delete',
        tableName: 'org_budget_scenario_lines', recordId: null,
        metadata: { ...reqMeta(req), scenario_id: scenarioId, account_id: accountId, program_id: programId, grant_id: grantId, month },
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /budget-scenarios/:id/lines:', e.message);
      return res.status(500).json({ error: 'Could not revert scenario line' });
    }
  });

  // ---- Detailed scenarios: fork live inputs, recalc, promote ----

  app.post('/api/organizational/orgs/:slug/budget-scenarios/:id/fork-inputs', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;

    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      if (scenario.scenario_type !== 'detailed') {
        return res.status(400).json({ error: 'Only detailed scenarios can fork inputs. Create the scenario with scenario_type: "detailed".' });
      }
      if (await scenarioHasForkedInputs(pool, scenarioId)) {
        return res.status(409).json({ error: 'This scenario already has forked inputs. Re-forking would discard edits already made inside it.' });
      }

      const result = await forkScenarioInputs(pool, { orgId, scenarioId, fiscalYear: scenario.fiscal_year, userId });
      await logAudit(pool, {
        orgId, userId, action: 'create',
        tableName: 'org_budget_scenarios', recordId: scenarioId,
        metadata: { ...reqMeta(req), action_detail: 'fork_inputs', ...result },
      });
      return res.status(201).json(result);
    } catch (e) {
      console.error('POST /budget-scenarios/:id/fork-inputs:', e.message);
      return res.status(500).json({ error: 'Could not fork inputs' });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-scenarios/:id/recalc', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    try {
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      if (scenario.scenario_type !== 'detailed') {
        return res.status(400).json({ error: 'Only detailed scenarios have forked inputs to recalculate.' });
      }
      if (!(await scenarioHasForkedInputs(pool, scenarioId))) {
        return res.status(409).json({ error: 'This scenario has no forked inputs yet. Fork inputs before recalculating.' });
      }

      const personnel = await recalcPersonnelBudget(pool, orgId, scenario.fiscal_year, { scenarioId });
      const schedule  = await recalcScheduleItems(pool, orgId, scenario.fiscal_year, null, { scenarioId });
      const grant     = await recalcGrantBudget(pool, orgId, scenario.fiscal_year, { scenarioId });
      return res.json({ personnel, schedule, grant });
    } catch (e) {
      console.error('POST /budget-scenarios/:id/recalc:', e.message);
      return res.status(500).json({ error: 'Could not recalculate scenario' });
    }
  });

  // ---- Promote to live ----
  //
  // Two independent paths, run together: (1) manual dollar-overlay cells (source_type='manual'
  // in org_budget_scenario_lines -- v1's Quick Overlay behavior, unchanged) UPSERT directly
  // into org_budget_lines, still refusing cells the live grid itself wouldn't allow a direct
  // edit on. (2) for detailed scenarios, forked input rows (personnel/schedule/grant_allocation)
  // promote by copying the scenario's input rows over the live ones and re-running the real
  // live recalc engines -- never by writing computed dollar amounts directly. See
  // .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md, "Promotion sequence."
  // Promoting to live is finance/admin only, separate from ordinary create/edit/compare work on
  // a scenario (which 'program' can do) -- permissions matrix finalized 2026-09-21
  // (.claude/plans/2026-09-19-solid-odi-demo-readiness.md).
  app.post('/api/organizational/orgs/:slug/budget-scenarios/:id/promote', ...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES]), async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const requestedSources = Array.isArray(body.sources) && body.sources.length
      ? body.sources.filter((s) => ['personnel', 'schedule', 'grant_allocation'].includes(s))
      : ['personnel', 'schedule', 'grant_allocation'];

    try {
      if (!(await requireAdminRole(pool, orgId, userId))) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const scenario = await loadScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      // ---- Path 1: manual dollar-overlay cells ----
      const manualOverrides = (await pool.query(
        `SELECT * FROM org_budget_scenario_lines WHERE scenario_id = $1 AND source_type = 'manual'`,
        [scenarioId]
      )).rows;

      let manualPromoted = 0;
      const manualSkipped = [];
      if (manualOverrides.length > 0) {
        // A cell is only directly promotable if the live budget line it targets is itself
        // directly editable: no existing row (brand-new line), an existing row a human already
        // broke out of automation (is_override), or a plain manual/prior_year row. Anything
        // still computed (personnel/schedule/grant_allocation, not overridden) gets reported
        // back instead of silently overwritten -- the next live recalc would clobber it anyway.
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const ov of manualOverrides) {
            const existing = await client.query(
              `SELECT id, source_type, is_override FROM org_budget_lines
               WHERE org_id = $1 AND account_id = $2 AND program_id = $3
                 AND COALESCE(grant_id, -1) = COALESCE($4::integer, -1)
                 AND fiscal_year = $5 AND month = $6`,
              [orgId, ov.account_id, ov.program_id, ov.grant_id, scenario.fiscal_year, ov.month]
            );
            const row = existing.rows[0];
            const promotable = !row || row.is_override || ['manual', 'prior_year'].includes(row.source_type);
            if (!promotable) {
              manualSkipped.push({ account_id: ov.account_id, program_id: ov.program_id, month: ov.month, reason: row.source_type });
              continue;
            }
            if (row) {
              await client.query(
                `UPDATE org_budget_lines SET amount_cents = $1, updated_at = NOW() WHERE id = $2`,
                [ov.amount_cents, row.id]
              );
            } else {
              await client.query(
                `INSERT INTO org_budget_lines
                   (org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [orgId, ov.account_id, ov.program_id, ov.grant_id, scenario.fiscal_year, ov.month, ov.amount_cents]
              );
            }
            manualPromoted++;
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }

      // ---- Path 2: detailed scenario forked inputs ----
      let inputsPromoted = null;
      if (scenario.scenario_type === 'detailed' && (await scenarioHasForkedInputs(pool, scenarioId))) {
        const client2 = await pool.connect();
        try {
          await client2.query('BEGIN');
          inputsPromoted = await promoteScenarioInputs(client2, {
            orgId, scenarioId, fiscalYear: scenario.fiscal_year, sources: requestedSources,
          });
          await client2.query('COMMIT');
        } catch (e) {
          await client2.query('ROLLBACK');
          throw e;
        } finally {
          client2.release();
        }

        // Re-run the real live recalc engines -- same functions the live Personnel/Schedules/
        // Grants tabs call after any edit, so promoted numbers are byte-identical to what
        // manually re-entering the same changes live would have produced. Each manages its own
        // transaction; a fiscal-year-lock failure here surfaces the same CA001 path as any
        // other live edit.
        if (requestedSources.includes('personnel')) await recalcPersonnelBudget(pool, orgId, scenario.fiscal_year);
        if (requestedSources.includes('schedule'))  await recalcScheduleItems(pool, orgId, scenario.fiscal_year, null);
        if (requestedSources.includes('grant_allocation')) await recalcGrantBudget(pool, orgId, scenario.fiscal_year);
      }

      await logAudit(pool, {
        orgId, userId, action: 'update',
        tableName: 'org_budget_lines', recordId: null,
        metadata: {
          ...reqMeta(req), promoted_from_scenario_id: scenarioId,
          manual_promoted: manualPromoted, manual_skipped: manualSkipped.length,
          inputs_promoted: inputsPromoted,
        },
      });
      await invalidateOrganizationalSummaryCache(pool, orgId);
      return res.json({ manual_promoted: manualPromoted, manual_skipped: manualSkipped, inputs_promoted: inputsPromoted });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /budget-scenarios/:id/promote:', e.message);
      return res.status(500).json({ error: 'Could not promote scenario' });
    }
  });
}

module.exports = { registerBudgetScenarioRoutes };
