'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { calculatePersonnelProjections, calculateWorkerProjections, resolveFringeAccountIds } = require('../lib/personnelCalculator');
const { recalcPersonnelBudget } = require('../lib/personnelRecalc');
const { syncPersonnelCarryforward, cleanupPersonnelCarryforward } = require('../lib/personnelCarryforward');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');

async function requireAdminRole(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT role::text AS role FROM org_users WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  const role = String((r.rows[0] && r.rows[0].role) || '').toLowerCase();
  return role === 'admin' || role === 'editor' || role === '';
}

function rowToFringe(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    org_id: Number(row.org_id),
    suta_rate_bps: Number(row.suta_rate_bps),
    suta_wage_base_cents: Number(row.suta_wage_base_cents),
    workers_comp_rate_bps: Number(row.workers_comp_rate_bps),
    health_ee_monthly_cents: Number(row.health_ee_monthly_cents),
    health_ee_spouse_monthly_cents: Number(row.health_ee_spouse_monthly_cents),
    health_ee_family_monthly_cents: Number(row.health_ee_family_monthly_cents),
    retirement_rate_bps: Number(row.retirement_rate_bps),
    dental_vision_monthly_cents: Number(row.dental_vision_monthly_cents),
    disability_rate_bps: Number(row.disability_rate_bps),
    other_monthly_cents: Number(row.other_monthly_cents),
    ss_wage_base_cents: Number(row.ss_wage_base_cents),
    fica_account_id: row.fica_account_id ? Number(row.fica_account_id) : null,
    suta_account_id: row.suta_account_id ? Number(row.suta_account_id) : null,
    workers_comp_account_id: row.workers_comp_account_id ? Number(row.workers_comp_account_id) : null,
    retirement_account_id: row.retirement_account_id ? Number(row.retirement_account_id) : null,
    disability_account_id: row.disability_account_id ? Number(row.disability_account_id) : null,
    health_account_id: row.health_account_id ? Number(row.health_account_id) : null,
    dental_vision_account_id: row.dental_vision_account_id ? Number(row.dental_vision_account_id) : null,
    other_fringe_account_id: row.other_fringe_account_id ? Number(row.other_fringe_account_id) : null,
    notes: row.notes || null,
    updated_at: row.updated_at,
  };
}

function rowToWorker(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    org_id: Number(row.org_id),
    fiscal_year: Number(row.fiscal_year),
    worker_type: row.worker_type,
    full_name: row.full_name,
    title: row.title || null,
    salary_account_id: row.salary_account_id ? Number(row.salary_account_id) : null,
    annual_salary_cents: row.annual_salary_cents != null ? Number(row.annual_salary_cents) : null,
    fte_bps: row.fte_bps != null ? Number(row.fte_bps) : null,
    start_month: row.start_month != null ? Number(row.start_month) : null,
    end_month: row.end_month != null ? Number(row.end_month) : null,
    avg_hours_per_week: row.avg_hours_per_week != null ? Number(row.avg_hours_per_week) : null,
    health_tier: row.health_tier || null,
    employment_type: row.employment_type || 'full-time',
    contract_type: row.contract_type || 'hourly',
    payroll_id: row.payroll_id || null,
    department_code: row.department_code || null,
    flsa_status: row.flsa_status || 'exempt',
    use_custom_fringe: !!row.use_custom_fringe,
    custom_suta_rate_bps: row.custom_suta_rate_bps != null ? Number(row.custom_suta_rate_bps) : null,
    custom_workers_comp_rate_bps: row.custom_workers_comp_rate_bps != null ? Number(row.custom_workers_comp_rate_bps) : null,
    custom_retirement_rate_bps: row.custom_retirement_rate_bps != null ? Number(row.custom_retirement_rate_bps) : null,
    custom_dental_vision_monthly_cents: row.custom_dental_vision_monthly_cents != null ? Number(row.custom_dental_vision_monthly_cents) : null,
    custom_disability_rate_bps: row.custom_disability_rate_bps != null ? Number(row.custom_disability_rate_bps) : null,
    custom_other_monthly_cents: row.custom_other_monthly_cents != null ? Number(row.custom_other_monthly_cents) : null,
    contractor_account_id: row.contractor_account_id ? Number(row.contractor_account_id) : null,
    monthly_fee_cents: row.monthly_fee_cents != null ? Number(row.monthly_fee_cents) : null,
    notes: row.notes || null,
    auto_generated: !!row.auto_generated,
    created_at: row.created_at,
    updated_at: row.updated_at,
    allocations: row.allocations || [],
  };
}

function parseInt10(v) {
  const n = Number.parseInt(String(v || ''), 10);
  return Number.isFinite(n) ? n : null;
}

function parseCents(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function parseHours(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v) * 10) / 10;
  return Number.isFinite(n) ? n : null;
}

async function logPersonnelChange(pool, opts) {
  const { orgId, workerId, userId, action, fieldName, oldValue, newValue, memo } = opts;
  try {
    await pool.query(
      `INSERT INTO org_personnel_changes (org_id, coop_personnel_id, user_id, action, field_name, old_value, new_value, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [orgId, workerId || null, userId || null, action, fieldName || null, oldValue || null, newValue || null, memo || null]
    );
  } catch (e) {
    if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
    console.error('logPersonnelChange error:', e.message);
  }
}

function registerOrganizationalPersonnelRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // --- GET fringe settings ---
  app.get('/api/organizational/orgs/:slug/personnel/fringe-settings', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      let row = (await pool.query(`SELECT * FROM org_fringe_settings WHERE org_id = $1 LIMIT 1`, [orgId])).rows[0];
      if (!row) {
        row = (await pool.query(`INSERT INTO org_fringe_settings (org_id) VALUES ($1) RETURNING *`, [orgId])).rows[0];
      }
      return res.json({ fringe_settings: rowToFringe(row) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /personnel/fringe-settings:', e.message);
      return res.status(500).json({ error: 'Could not load fringe settings' });
    }
  });

  // --- PATCH fringe settings ---
  app.patch('/api/organizational/orgs/:slug/personnel/fringe-settings', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });

      // Build SET clause from allowed fields only
      const allowed = [
        'suta_rate_bps', 'suta_wage_base_cents', 'workers_comp_rate_bps',
        'health_ee_monthly_cents', 'health_ee_spouse_monthly_cents', 'health_ee_family_monthly_cents',
        'retirement_rate_bps', 'dental_vision_monthly_cents', 'disability_rate_bps',
        'other_monthly_cents', 'ss_wage_base_cents', 'notes',
        'fica_account_id', 'suta_account_id', 'workers_comp_account_id', 'retirement_account_id',
        'disability_account_id', 'health_account_id', 'dental_vision_account_id', 'other_fringe_account_id',
      ];
      const sets = [];
      const params = [orgId];
      let p = 2;
      for (const field of allowed) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        const v = body[field];
        sets.push(`${field} = $${p}`);
        params.push(v === '' ? null : v);
        p++;
      }
      if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
      sets.push(`updated_at = NOW()`);

      const r = await pool.query(
        `INSERT INTO org_fringe_settings (org_id) VALUES ($1)
         ON CONFLICT (org_id) DO UPDATE SET ${sets.join(', ')}
         RETURNING *`,
        params
      );

      // Auto-recalculate projections and budget lines for the specified FY
      const fy = parseInt10(body.fiscal_year || req.query.fiscal_year);
      if (fy) {
        await calculatePersonnelProjections(pool, orgId, fy, userId);
        await recalcPersonnelBudget(pool, orgId, fy);
      }

      return res.json({ fringe_settings: rowToFringe(r.rows[0]) });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('PATCH /personnel/fringe-settings:', e.message);
      return res.status(500).json({ error: 'Could not update fringe settings' });
    }
  });

  // --- POST copy-from-prior-year ---
  app.post('/api/organizational/orgs/:slug/personnel/copy-from-prior-year', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const toFY = parseInt10(body.fiscal_year);
    if (!toFY) return res.status(400).json({ error: 'fiscal_year required' });
    const fromFY = toFY - 1;
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });

      // Load prior-year workers
      const prior = (await pool.query(
        `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 ORDER BY id`,
        [orgId, fromFY]
      )).rows;
      if (prior.length === 0) return res.json({ copied: 0 });

      const priorIds = prior.map(w => w.id);
      const allocsRes = await pool.query(
        `SELECT * FROM org_personnel_allocations WHERE coop_personnel_id = ANY($1::bigint[])`,
        [priorIds]
      );
      const allocsByWorker = {};
      for (const a of allocsRes.rows) {
        (allocsByWorker[String(a.coop_personnel_id)] = allocsByWorker[String(a.coop_personnel_id)] || []).push(a);
      }

      const client = await pool.connect();
      let copied = 0;
      try {
        await client.query('BEGIN');
        for (const w of prior) {
          const newRow = await client.query(
            `INSERT INTO org_personnel
               (org_id, fiscal_year, worker_type, full_name, title,
                salary_account_id, annual_salary_cents, fte_bps, start_month, end_month, avg_hours_per_week, health_tier,
                use_custom_fringe, custom_suta_rate_bps, custom_workers_comp_rate_bps, custom_retirement_rate_bps,
                custom_dental_vision_monthly_cents, custom_disability_rate_bps, custom_other_monthly_cents,
                contractor_account_id, monthly_fee_cents, notes, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23)
             RETURNING id`,
            [
              orgId, toFY, w.worker_type, w.full_name, w.title,
              w.salary_account_id, w.annual_salary_cents, w.fte_bps, w.start_month, w.end_month, w.avg_hours_per_week, w.health_tier,
              w.use_custom_fringe, w.custom_suta_rate_bps, w.custom_workers_comp_rate_bps, w.custom_retirement_rate_bps,
              w.custom_dental_vision_monthly_cents, w.custom_disability_rate_bps, w.custom_other_monthly_cents,
              w.contractor_account_id, w.monthly_fee_cents, w.notes, userId,
            ]
          );
          const newId = newRow.rows[0].id;
          const allocs = allocsByWorker[String(w.id)] || [];
          for (const a of allocs) {
            await client.query(
              `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
               VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
              [newId, orgId, a.coop_program_id, a.percent_bps]
            );
          }
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
      return res.json({ copied, from_fiscal_year: fromFY, to_fiscal_year: toFY });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /personnel/copy-from-prior-year:', e.message);
      return res.status(500).json({ error: 'Could not copy personnel' });
    }
  });

  // --- POST recalculate (push to projections) ---
  app.post('/api/organizational/orgs/:slug/personnel/recalculate', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = parseInt10(req.query.fiscal_year || (req.body && req.body.fiscal_year));
    if (!fy) return res.status(400).json({ error: 'fiscal_year required' });
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });
      const result = await calculatePersonnelProjections(pool, orgId, fy, userId);
      const budgetResult = await recalcPersonnelBudget(pool, orgId, fy);
      return res.json({ ok: true, ...result, budget_lines_written: budgetResult.lines_written });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /personnel/recalculate:', e.message);
      return res.status(500).json({ error: 'Could not recalculate personnel projections' });
    }
  });

  // --- GET list workers ---
  app.get('/api/organizational/orgs/:slug/personnel', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = parseInt10(req.query.fiscal_year);
    if (!fy) return res.status(400).json({ error: 'fiscal_year required' });
    try {
      const workers = (await pool.query(
        `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 ORDER BY worker_type, full_name`,
        [orgId, fy]
      )).rows;
      const ids = workers.map(w => w.id);
      const allocs = ids.length
        ? (await pool.query(
            `SELECT pa.*, pr.name AS program_name
             FROM org_personnel_allocations pa
             LEFT JOIN org_programs pr ON pr.id = pa.coop_program_id
             WHERE pa.coop_personnel_id = ANY($1::bigint[])
             ORDER BY pa.coop_personnel_id, pa.id`,
            [ids]
          )).rows
        : [];
      const allocsByWorker = {};
      for (const a of allocs) {
        (allocsByWorker[String(a.coop_personnel_id)] = allocsByWorker[String(a.coop_personnel_id)] || []).push(a);
      }

      // Load fringe settings to calculate projected costs
      let fringeRow = (await pool.query(
        `SELECT * FROM org_fringe_settings WHERE org_id = $1 LIMIT 1`,
        [orgId]
      )).rows[0];
      if (!fringeRow) {
        fringeRow = (await pool.query(
          `INSERT INTO org_fringe_settings (org_id) VALUES ($1) RETURNING *`,
          [orgId]
        )).rows[0];
      }
      const fringeAccountIds = resolveFringeAccountIds(fringeRow);

      const result = workers.map(w => {
        const wObj = rowToWorker(w);
        wObj.allocations = allocsByWorker[String(w.id)] || [];
        const projLines = calculateWorkerProjections(w, wObj.allocations, fringeRow, fringeAccountIds);
        wObj.projected_annual_cents = projLines.reduce((sum, l) => sum + l.amount_cents, 0);
        return wObj;
      });
      return res.json({ personnel: result });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /personnel:', e.message);
      return res.status(500).json({ error: 'Could not load personnel' });
    }
  });

  // --- GET account summary (projections by account) ---
  app.get('/api/organizational/orgs/:slug/personnel/account-summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const fy = parseInt10(req.query.fiscal_year);
    if (!fy) return res.status(400).json({ error: 'fiscal_year required' });
    try {
      const result = (await pool.query(
        `SELECT a.id, a.code, a.name, SUM(p.amount_cents)::bigint AS total_cents
         FROM org_projections p
         JOIN org_accounts a ON a.id = p.coop_account_id
         WHERE p.org_id = $1 AND p.fiscal_year = $2 AND p.notes = 'personnel-schedule'
         GROUP BY a.id, a.code, a.name
         ORDER BY a.code`,
        [orgId, fy]
      )).rows;
      const summary = result.map(row => ({
        account_id: Number(row.id),
        account_code: row.code,
        account_name: row.name,
        total_cents: Number(row.total_cents) || 0,
      }));
      return res.json({ summary });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /personnel/account-summary:', e.message);
      return res.status(500).json({ error: 'Could not load account summary' });
    }
  });

  // --- POST create worker ---
  app.post('/api/organizational/orgs/:slug/personnel', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fy = parseInt10(body.fiscal_year);
    if (!fy) return res.status(400).json({ error: 'fiscal_year required' });
    const fullName = String(body.full_name || '').trim();
    if (!fullName) return res.status(400).json({ error: 'full_name required' });
    const workerType = String(body.worker_type || 'employee');
    if (!['employee', 'contractor'].includes(workerType)) return res.status(400).json({ error: 'worker_type must be employee or contractor' });
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });

      const r = await pool.query(
        `INSERT INTO org_personnel
           (org_id, fiscal_year, worker_type, full_name, title,
            salary_account_id, annual_salary_cents, fte_bps, start_month, end_month, avg_hours_per_week, health_tier,
            employment_type, contract_type, payroll_id, department_code, flsa_status,
            use_custom_fringe, custom_suta_rate_bps, custom_workers_comp_rate_bps, custom_retirement_rate_bps,
            custom_dental_vision_monthly_cents, custom_disability_rate_bps, custom_other_monthly_cents,
            contractor_account_id, monthly_fee_cents, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$28)
         RETURNING *`,
        [
          orgId, fy, workerType, fullName,
          body.title ? String(body.title) : null,
          parseInt10(body.salary_account_id),
          parseCents(body.annual_salary_cents),
          parseInt10(body.fte_bps),
          parseInt10(body.start_month),
          parseInt10(body.end_month),
          parseHours(body.avg_hours_per_week),
          body.health_tier || null,
          body.employment_type || 'full-time',
          body.contract_type || 'hourly',
          body.payroll_id ? String(body.payroll_id) : null,
          body.department_code ? String(body.department_code) : null,
          body.flsa_status || 'exempt',
          !!body.use_custom_fringe,
          parseInt10(body.custom_suta_rate_bps),
          parseInt10(body.custom_workers_comp_rate_bps),
          parseInt10(body.custom_retirement_rate_bps),
          parseInt10(body.custom_dental_vision_monthly_cents),
          parseInt10(body.custom_disability_rate_bps),
          parseInt10(body.custom_other_monthly_cents),
          parseInt10(body.contractor_account_id),
          parseCents(body.monthly_fee_cents),
          body.notes ? String(body.notes) : null,
          userId,
        ]
      );
      const worker = rowToWorker(r.rows[0]);

      // Insert allocations if provided
      if (Array.isArray(body.allocations) && body.allocations.length > 0) {
        for (const a of body.allocations) {
          const programId = parseInt10(a.coop_program_id || a.program_id);
          const bps = parseInt10(a.percent_bps);
          if (!programId || !bps) continue;
          await pool.query(
            `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [worker.id, orgId, programId, bps]
          );
        }
        worker.allocations = (await pool.query(
          `SELECT pa.*, pr.name AS program_name FROM org_personnel_allocations pa
           LEFT JOIN org_programs pr ON pr.id = pa.coop_program_id
           WHERE pa.coop_personnel_id = $1 ORDER BY pa.id`,
          [worker.id]
        )).rows;
      }

      // Log creation and auto-recalculate projections + budget lines
      await logPersonnelChange(pool, { orgId, workerId: worker.id, userId, action: 'create', memo: 'Worker created' });
      await calculatePersonnelProjections(pool, orgId, fy, userId);
      await recalcPersonnelBudget(pool, orgId, fy);

      // Ongoing position (no mid-year end date) with no next-FY row yet gets
      // carried forward automatically — see personnelCarryforward.js.
      syncPersonnelCarryforward(pool, orgId, r.rows[0], userId).catch(e =>
        console.error('personnelCarryforward after POST worker:', e.message)
      );

      return res.status(201).json({ worker });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('POST /personnel:', e.message);
      return res.status(500).json({ error: 'Could not create worker' });
    }
  });

  // --- PATCH update worker ---
  app.patch('/api/organizational/orgs/:slug/personnel/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = parseInt10(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalid' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });

      const cur = (await pool.query(`SELECT * FROM org_personnel WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId])).rows[0];
      if (!cur) return res.status(404).json({ error: 'Worker not found' });

      // A human directly editing an auto-carried-forward worker claims it —
      // the carryforward engine will not touch or replace it again after this.
      if (cur.auto_generated) {
        await pool.query(`UPDATE org_personnel SET auto_generated = FALSE WHERE id = $1`, [id]);
      }

      const scalarFields = [
        'full_name', 'title', 'salary_account_id', 'annual_salary_cents', 'fte_bps',
        'start_month', 'end_month', 'avg_hours_per_week', 'health_tier', 'employment_type', 'contract_type',
        'payroll_id', 'department_code', 'flsa_status', 'use_custom_fringe',
        'custom_suta_rate_bps', 'custom_workers_comp_rate_bps', 'custom_retirement_rate_bps',
        'custom_dental_vision_monthly_cents', 'custom_disability_rate_bps', 'custom_other_monthly_cents',
        'contractor_account_id', 'monthly_fee_cents', 'notes',
      ];
      const sets = [`updated_by = $2`, `updated_at = NOW()`];
      const params = [id, userId];
      let p = 3;
      for (const f of scalarFields) {
        if (!Object.prototype.hasOwnProperty.call(body, f)) continue;
        sets.push(`${f} = $${p}`);
        const v = f === 'avg_hours_per_week' ? parseHours(body[f]) : (body[f] === '' || body[f] === undefined ? null : body[f]);
        params.push(v);
        p++;
      }

      const upd = (await pool.query(
        `UPDATE org_personnel SET ${sets.join(', ')} WHERE id = $1 AND org_id = $${p} RETURNING *`,
        [...params, orgId]
      )).rows[0];

      // Log field changes (diffs)
      const auditedFields = ['full_name', 'title', 'annual_salary_cents', 'fte_bps', 'start_month', 'end_month',
        'avg_hours_per_week', 'health_tier', 'employment_type', 'contract_type', 'salary_account_id', 'contractor_account_id',
        'monthly_fee_cents', 'payroll_id', 'department_code', 'flsa_status'];
      for (const f of auditedFields) {
        const oldVal = String(cur[f] ?? '');
        const newVal = String(upd[f] ?? '');
        if (oldVal !== newVal) {
          await logPersonnelChange(pool, { orgId, workerId: id, userId, action: 'update',
            fieldName: f, oldValue: oldVal || null, newValue: newVal || null });
        }
      }

      // Replace allocations if provided
      if (Array.isArray(body.allocations)) {
        await pool.query(`DELETE FROM org_personnel_allocations WHERE coop_personnel_id = $1`, [id]);
        for (const a of body.allocations) {
          const programId = parseInt10(a.coop_program_id || a.program_id);
          const bps = parseInt10(a.percent_bps);
          if (!programId || !bps) continue;
          await pool.query(
            `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [id, orgId, programId, bps]
          );
        }
      }

      const worker = rowToWorker(upd);
      worker.allocations = (await pool.query(
        `SELECT pa.*, pr.name AS program_name FROM org_personnel_allocations pa
         LEFT JOIN org_programs pr ON pr.id = pa.coop_program_id
         WHERE pa.coop_personnel_id = $1 ORDER BY pa.id`,
        [id]
      )).rows;

      // Auto-recalculate projections and budget lines
      await calculatePersonnelProjections(pool, orgId, upd.fiscal_year, userId);
      await recalcPersonnelBudget(pool, orgId, upd.fiscal_year);

      // Re-sync next-FY carryforward against this worker's (possibly
      // just-changed) end_month/salary/etc.
      syncPersonnelCarryforward(pool, orgId, upd, userId).catch(e =>
        console.error('personnelCarryforward after PATCH worker:', e.message)
      );

      return res.json({ worker });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('PATCH /personnel/:id:', e.message);
      return res.status(500).json({ error: 'Could not update worker' });
    }
  });

  // --- DELETE worker ---
  app.delete('/api/organizational/orgs/:slug/personnel/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = parseInt10(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalid' });
    try {
      if (!(await requireAdminRole(pool, orgId, userId))) return res.status(403).json({ error: 'Insufficient permissions' });

      // Fetch worker before deleting to get fiscal_year and name for logging
      const cur = (await pool.query(
        `SELECT * FROM org_personnel WHERE id = $1 AND org_id = $2 LIMIT 1`,
        [id, orgId]
      )).rows[0];
      if (!cur) return res.status(404).json({ error: 'Worker not found' });

      const del = await pool.query(
        `DELETE FROM org_personnel WHERE id = $1 AND org_id = $2 RETURNING id`,
        [id, orgId]
      );
      if (!del.rowCount) return res.status(404).json({ error: 'Worker not found' });

      // Log deletion and auto-recalculate projections + budget lines
      await logPersonnelChange(pool, { orgId, workerId: id, userId, action: 'delete',
        memo: `Deleted: ${cur.full_name}` });
      await calculatePersonnelProjections(pool, orgId, cur.fiscal_year, userId);
      await recalcPersonnelBudget(pool, orgId, cur.fiscal_year);

      // If this worker had an auto-generated next-FY clone, its origin is
      // gone now — remove the clone too.
      cleanupPersonnelCarryforward(pool, orgId, cur, userId).catch(e =>
        console.error('personnelCarryforward cleanup after DELETE worker:', e.message)
      );

      return res.json({ ok: true, deleted_id: id });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('DELETE /personnel/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete worker' });
    }
  });

  // --- GET worker change history ---
  app.get('/api/organizational/orgs/:slug/personnel/:id/changes', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const id = parseInt10(req.params.id);
    if (!id) return res.status(400).json({ error: 'id invalid' });
    try {

      const changes = (await pool.query(
        `SELECT pch.*, u.email FROM org_personnel_changes pch
         LEFT JOIN users u ON u.id = pch.user_id
         WHERE pch.coop_personnel_id = $1 AND pch.org_id = $2
         ORDER BY pch.changed_at DESC LIMIT 50`,
        [id, orgId]
      )).rows;

      return res.json({ changes });
    } catch (e) {
      if (isFiscalYearLockedError(e)) return res.status(409).json({ error: e.message, code: 'fiscal_year_locked' });
      console.error('GET /personnel/:id/changes:', e.message);
      return res.status(500).json({ error: 'Could not fetch change history' });
    }
  });
}

module.exports = { registerOrganizationalPersonnelRoutes };
