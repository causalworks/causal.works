'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { scenarioHasForkedInputs } = require('../lib/scenarioFork');

/**
 * CRUD for editing a detailed scenario's forked personnel roster and grant allocations --
 * intentionally a separate, minimal surface from the live personnel.js/grants.js routes rather
 * than retrofitting those (much larger, live-only) files with scenario awareness. See
 * .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md.
 *
 * All write endpoints require the scenario to already have forked inputs (via fork-inputs) --
 * editing before forking would let a scenario hold a partial roster, and promotion treats
 * whatever rows exist under the scenario's scope as the complete desired live set.
 *
 * Schedule items deliberately mirror only the minimal CRUD shape (create/update/delete the
 * row + its allocations) -- NOT the live schedule-items.js route's fiscal-year-lock checks,
 * carryforward spawning, or auto-recalc-on-every-write. A scenario's forked fiscal year isn't
 * subject to the live lock (it's a draft copy), carryforward (spawning a sibling row into next
 * FY) isn't a meaningful concept for a hypothetical, and recalc here is explicit via the
 * scenario's own Recalculate button (same pattern personnel/grant-allocations already use) --
 * not implicit on every field edit.
 */

function parseInt10(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number.parseInt(String(v), 10);
  return Number.isInteger(n) ? n : null;
}
function parseCents(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

async function loadDetailedScenario(pool, orgId, scenarioId) {
  const r = await pool.query(
    `SELECT * FROM org_budget_scenarios WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [scenarioId, orgId]
  );
  return r.rows[0] || null;
}

const SCHEDULE_ITEM_FIELDS = [
  'account_id', 'program_id', 'grant_id', 'label', 'schedule_type', 'quantity',
  'unit_amount_cents', 'frequency', 'active_months', 'start_month', 'end_month',
  'notes', 'sort_order', 'named_schedule_id', 'policy_start_date', 'policy_end_date',
];

function rowToScheduleItem(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    scenario_id: row.scenario_id,
    account_id: row.account_id,
    program_id: row.program_id,
    grant_id: row.grant_id,
    label: row.label,
    schedule_type: row.schedule_type,
    quantity: Number(row.quantity),
    unit_amount_cents: Number(row.unit_amount_cents),
    frequency: row.frequency,
    active_months: row.active_months || null,
    start_month: row.start_month,
    end_month: row.end_month,
    notes: row.notes,
    sort_order: row.sort_order,
    named_schedule_id: row.named_schedule_id ? Number(row.named_schedule_id) : null,
    policy_start_date: row.policy_start_date || null,
    policy_end_date: row.policy_end_date || null,
  };
}

async function loadScheduleItemAllocations(pool, itemIds) {
  const byItem = new Map();
  if (!itemIds.length) return byItem;
  const { rows } = await pool.query(
    `SELECT sa.*, p.name AS program_name FROM org_schedule_item_allocations sa
     LEFT JOIN org_programs p ON p.id = sa.coop_program_id
     WHERE sa.coop_schedule_item_id = ANY($1::bigint[]) ORDER BY sa.coop_schedule_item_id, sa.id`,
    [itemIds]
  );
  for (const a of rows) {
    const key = String(a.coop_schedule_item_id);
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(a);
  }
  return byItem;
}

async function replaceScheduleItemAllocations(pool, orgId, itemId, allocations) {
  await pool.query(`DELETE FROM org_schedule_item_allocations WHERE coop_schedule_item_id = $1`, [itemId]);
  for (const a of allocations) {
    const programId = parseInt10(a.coop_program_id ?? a.program_id);
    const bps = parseInt10(a.percent_bps);
    if (!programId || !bps) continue;
    await pool.query(
      `INSERT INTO org_schedule_item_allocations (coop_schedule_item_id, org_id, coop_program_id, percent_bps)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [itemId, orgId, programId, bps]
    );
  }
  return (await loadScheduleItemAllocations(pool, [itemId])).get(String(itemId)) || [];
}

function rowToWorker(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    scenario_id: row.scenario_id,
    worker_type: row.worker_type,
    full_name: row.full_name,
    title: row.title,
    salary_account_id: row.salary_account_id,
    annual_salary_cents: row.annual_salary_cents != null ? Number(row.annual_salary_cents) : null,
    fte_bps: row.fte_bps,
    start_month: row.start_month,
    end_month: row.end_month,
    contractor_account_id: row.contractor_account_id,
    monthly_fee_cents: row.monthly_fee_cents != null ? Number(row.monthly_fee_cents) : null,
    notes: row.notes,
  };
}

function registerScenarioInputRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // ---- Personnel ----

  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/personnel', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const workers = (await pool.query(
        `SELECT * FROM org_personnel WHERE scenario_id = $1 ORDER BY full_name`, [scenarioId]
      )).rows;
      const workerIds = workers.map((w) => w.id);
      const allocs = workerIds.length
        ? (await pool.query(
            `SELECT pa.*, pr.name AS program_name FROM org_personnel_allocations pa
             LEFT JOIN org_programs pr ON pr.id = pa.coop_program_id
             WHERE pa.coop_personnel_id = ANY($1::bigint[]) ORDER BY pa.id`,
            [workerIds]
          )).rows
        : [];
      const allocsByWorker = new Map();
      for (const a of allocs) {
        const key = String(a.coop_personnel_id);
        if (!allocsByWorker.has(key)) allocsByWorker.set(key, []);
        allocsByWorker.get(key).push(a);
      }

      return res.json({
        personnel: workers.map((w) => ({ ...rowToWorker(w), allocations: allocsByWorker.get(String(w.id)) || [] })),
      });
    } catch (e) {
      console.error('GET .../budget-scenarios/:id/personnel:', e.message);
      return res.status(500).json({ error: 'Could not load scenario personnel' });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-scenarios/:id/personnel', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const fullName = String(body.full_name || '').trim();
    if (!fullName) return res.status(400).json({ error: 'full_name is required' });

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      if (scenario.scenario_type !== 'detailed') return res.status(400).json({ error: 'Only detailed scenarios can edit personnel' });
      if (!(await scenarioHasForkedInputs(pool, scenarioId))) {
        return res.status(409).json({ error: 'Fork inputs before adding personnel to this scenario.' });
      }

      const ins = await pool.query(
        `INSERT INTO org_personnel
           (org_id, fiscal_year, scenario_id, worker_type, full_name, title,
            salary_account_id, annual_salary_cents, fte_bps, start_month, end_month,
            contractor_account_id, monthly_fee_cents, notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
         RETURNING *`,
        [
          orgId, scenario.fiscal_year, scenarioId,
          String(body.worker_type || 'employee'), fullName,
          body.title ? String(body.title) : null,
          parseInt10(body.salary_account_id), parseCents(body.annual_salary_cents),
          parseInt10(body.fte_bps), parseInt10(body.start_month) || 1, parseInt10(body.end_month) || 12,
          parseInt10(body.contractor_account_id), parseCents(body.monthly_fee_cents),
          body.notes ? String(body.notes) : null, userId,
        ]
      );
      const worker = ins.rows[0];

      if (Array.isArray(body.allocations)) {
        for (const a of body.allocations) {
          const programId = parseInt10(a.program_id);
          const bps = parseInt10(a.percent_bps);
          if (!programId || !bps) continue;
          await pool.query(
            `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
             VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
            [worker.id, orgId, programId, bps]
          );
        }
      }

      await logAudit(pool, {
        orgId, userId, action: 'create', tableName: 'org_personnel', recordId: worker.id,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.status(201).json({ worker: rowToWorker(worker) });
    } catch (e) {
      console.error('POST .../budget-scenarios/:id/personnel:', e.message);
      return res.status(500).json({ error: 'Could not add scenario personnel' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/budget-scenarios/:id/personnel/:workerId', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    const workerId = Number.parseInt(String(req.params.workerId || ''), 10);
    if (!Number.isInteger(scenarioId) || !Number.isInteger(workerId)) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const existing = await pool.query(
        `SELECT id FROM org_personnel WHERE id = $1 AND scenario_id = $2 AND org_id = $3`,
        [workerId, scenarioId, orgId]
      );
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Scenario worker not found' });

      const fields = [];
      const params = [];
      let p = 1;
      const settable = {
        full_name: (v) => String(v).trim(), title: (v) => (v ? String(v) : null),
        salary_account_id: parseInt10, annual_salary_cents: parseCents, fte_bps: parseInt10,
        start_month: parseInt10, end_month: parseInt10, contractor_account_id: parseInt10,
        monthly_fee_cents: parseCents, notes: (v) => (v ? String(v) : null),
      };
      for (const [key, coerce] of Object.entries(settable)) {
        if (body[key] !== undefined) {
          fields.push(`${key} = $${p}`); params.push(coerce(body[key])); p += 1;
        }
      }
      if (fields.length) {
        fields.push('updated_at = NOW()', `updated_by = $${p}`); params.push(userId); p += 1;
        params.push(workerId);
        await pool.query(`UPDATE org_personnel SET ${fields.join(', ')} WHERE id = $${p}`, params);
      }

      if (Array.isArray(body.allocations)) {
        await pool.query(`DELETE FROM org_personnel_allocations WHERE coop_personnel_id = $1`, [workerId]);
        for (const a of body.allocations) {
          const programId = parseInt10(a.program_id);
          const bps = parseInt10(a.percent_bps);
          if (!programId || !bps) continue;
          await pool.query(
            `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
             VALUES ($1,$2,$3,$4)`,
            [workerId, orgId, programId, bps]
          );
        }
      }

      const updated = (await pool.query(`SELECT * FROM org_personnel WHERE id = $1`, [workerId])).rows[0];
      await logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_personnel', recordId: workerId,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({ worker: rowToWorker(updated) });
    } catch (e) {
      console.error('PATCH .../budget-scenarios/:id/personnel/:workerId:', e.message);
      return res.status(500).json({ error: 'Could not update scenario personnel' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/budget-scenarios/:id/personnel/:workerId', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    const workerId = Number.parseInt(String(req.params.workerId || ''), 10);
    if (!Number.isInteger(scenarioId) || !Number.isInteger(workerId)) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const del = await pool.query(
        `DELETE FROM org_personnel WHERE id = $1 AND scenario_id = $2 AND org_id = $3`,
        [workerId, scenarioId, orgId]
      );
      if (del.rowCount === 0) return res.status(404).json({ error: 'Scenario worker not found' });

      await logAudit(pool, {
        orgId, userId, action: 'delete', tableName: 'org_personnel', recordId: workerId,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE .../budget-scenarios/:id/personnel/:workerId:', e.message);
      return res.status(500).json({ error: 'Could not remove scenario personnel' });
    }
  });

  // ---- Schedule items ----

  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/schedule-items', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const items = (await pool.query(
        `SELECT s.*, a.name AS account_name, a.code AS account_code,
                p.name AS program_name, g.name AS grant_name
         FROM org_schedule_items s
         LEFT JOIN org_accounts a ON a.id = s.account_id
         LEFT JOIN org_programs p ON p.id = s.program_id
         LEFT JOIN org_grants   g ON g.id = s.grant_id
         WHERE s.scenario_id = $1
         ORDER BY s.schedule_type, s.sort_order, s.id`,
        [scenarioId]
      )).rows;
      const allocsByItem = await loadScheduleItemAllocations(pool, items.map((i) => i.id));

      return res.json({
        schedule_items: items.map((i) => ({
          ...rowToScheduleItem(i),
          account_name: i.account_name, account_code: i.account_code,
          program_name: i.program_name, grant_name: i.grant_name,
          allocations: allocsByItem.get(String(i.id)) || [],
        })),
      });
    } catch (e) {
      console.error('GET .../budget-scenarios/:id/schedule-items:', e.message);
      return res.status(500).json({ error: 'Could not load scenario schedule items' });
    }
  });

  app.post('/api/organizational/orgs/:slug/budget-scenarios/:id/schedule-items', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const label = String(body.label || '').trim();
    if (!label) return res.status(400).json({ error: 'label is required' });
    if (!body.account_id) return res.status(400).json({ error: 'account_id is required' });

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      if (scenario.scenario_type !== 'detailed') return res.status(400).json({ error: 'Only detailed scenarios can edit schedule items' });
      if (!(await scenarioHasForkedInputs(pool, scenarioId))) {
        return res.status(409).json({ error: 'Fork inputs before adding schedule items to this scenario.' });
      }

      const ins = await pool.query(
        `INSERT INTO org_schedule_items
           (org_id, fiscal_year, scenario_id, account_id, program_id, grant_id, label,
            schedule_type, quantity, unit_amount_cents, frequency, active_months,
            start_month, end_month, notes, sort_order, named_schedule_id,
            policy_start_date, policy_end_date)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING *`,
        [
          orgId, scenario.fiscal_year, scenarioId,
          parseInt10(body.account_id), parseInt10(body.program_id), parseInt10(body.grant_id),
          label, String(body.schedule_type || 'custom'),
          Number(body.quantity ?? 1), parseCents(body.unit_amount_cents) ?? 0,
          String(body.frequency || 'monthly'), body.active_months || null,
          parseInt10(body.start_month) || 1, parseInt10(body.end_month) || 12,
          body.notes ? String(body.notes) : null, parseInt10(body.sort_order) || 0,
          parseInt10(body.named_schedule_id),
          body.policy_start_date || null, body.policy_end_date || null,
        ]
      );
      const item = ins.rows[0];

      let allocations = [];
      if (Array.isArray(body.allocations) && body.allocations.length > 0) {
        allocations = await replaceScheduleItemAllocations(pool, orgId, item.id, body.allocations);
      }

      await logAudit(pool, {
        orgId, userId, action: 'create', tableName: 'org_schedule_items', recordId: item.id,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.status(201).json({ item: { ...rowToScheduleItem(item), allocations } });
    } catch (e) {
      console.error('POST .../budget-scenarios/:id/schedule-items:', e.message);
      return res.status(500).json({ error: 'Could not add scenario schedule item' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/budget-scenarios/:id/schedule-items/:itemId', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    const itemId = Number.parseInt(String(req.params.itemId || ''), 10);
    if (!Number.isInteger(scenarioId) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const existing = await pool.query(
        `SELECT id FROM org_schedule_items WHERE id = $1 AND scenario_id = $2 AND org_id = $3`,
        [itemId, scenarioId, orgId]
      );
      if (existing.rows.length === 0) return res.status(404).json({ error: 'Scenario schedule item not found' });

      const coerce = {
        label: (v) => String(v).trim(), schedule_type: (v) => String(v),
        account_id: parseInt10, program_id: parseInt10, grant_id: parseInt10,
        quantity: (v) => Number(v), unit_amount_cents: parseCents, frequency: (v) => String(v),
        active_months: (v) => v, start_month: parseInt10, end_month: parseInt10,
        notes: (v) => (v ? String(v) : null), sort_order: parseInt10,
        named_schedule_id: parseInt10, policy_start_date: (v) => (v || null), policy_end_date: (v) => (v || null),
      };
      const fields = [];
      const params = [];
      let p = 1;
      for (const key of SCHEDULE_ITEM_FIELDS) {
        if (body[key] !== undefined) {
          fields.push(`${key} = $${p}`); params.push(coerce[key](body[key])); p += 1;
        }
      }
      if (fields.length) {
        fields.push('updated_at = NOW()');
        params.push(itemId);
        await pool.query(`UPDATE org_schedule_items SET ${fields.join(', ')} WHERE id = $${p}`, params);
      }

      let allocations = (await loadScheduleItemAllocations(pool, [itemId])).get(String(itemId)) || [];
      if (Array.isArray(body.allocations)) {
        allocations = await replaceScheduleItemAllocations(pool, orgId, itemId, body.allocations);
      }

      const updated = (await pool.query(`SELECT * FROM org_schedule_items WHERE id = $1`, [itemId])).rows[0];
      await logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_schedule_items', recordId: itemId,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({ item: { ...rowToScheduleItem(updated), allocations } });
    } catch (e) {
      console.error('PATCH .../budget-scenarios/:id/schedule-items/:itemId:', e.message);
      return res.status(500).json({ error: 'Could not update scenario schedule item' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/budget-scenarios/:id/schedule-items/:itemId', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    const itemId = Number.parseInt(String(req.params.itemId || ''), 10);
    if (!Number.isInteger(scenarioId) || !Number.isInteger(itemId)) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const del = await pool.query(
        `DELETE FROM org_schedule_items WHERE id = $1 AND scenario_id = $2 AND org_id = $3`,
        [itemId, scenarioId, orgId]
      );
      if (del.rowCount === 0) return res.status(404).json({ error: 'Scenario schedule item not found' });

      await logAudit(pool, {
        orgId, userId, action: 'delete', tableName: 'org_schedule_items', recordId: itemId,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE .../budget-scenarios/:id/schedule-items/:itemId:', e.message);
      return res.status(500).json({ error: 'Could not remove scenario schedule item' });
    }
  });

  // ---- Grant allocations ----

  app.get('/api/organizational/orgs/:slug/budget-scenarios/:id/grant-allocations', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });

      const rows = (await pool.query(
        `SELECT ga.*, g.name AS grant_name, pr.name AS program_name
         FROM org_grant_allocations ga
         JOIN org_grants g ON g.id = ga.grant_id
         LEFT JOIN org_programs pr ON pr.id = ga.coop_program_id
         WHERE ga.scenario_id = $1
         ORDER BY g.name, pr.name`,
        [scenarioId]
      )).rows;
      return res.json({
        grant_allocations: rows.map((r) => ({
          id: Number(r.id), grant_id: r.grant_id, grant_name: r.grant_name,
          program_id: r.coop_program_id, program_name: r.program_name,
          amount_cents: Number(r.amount_cents),
        })),
      });
    } catch (e) {
      console.error('GET .../budget-scenarios/:id/grant-allocations:', e.message);
      return res.status(500).json({ error: 'Could not load scenario grant allocations' });
    }
  });

  app.put('/api/organizational/orgs/:slug/budget-scenarios/:id/grant-allocations', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const scenarioId = Number.parseInt(String(req.params.id || ''), 10);
    if (!Number.isInteger(scenarioId) || scenarioId < 1) return res.status(400).json({ error: 'Invalid id' });
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const grantId = parseInt10(body.grant_id);
    const programId = parseInt10(body.program_id);
    const amount = parseCents(body.amount_cents);
    if (!grantId || !programId || amount == null || amount < 0) {
      return res.status(400).json({ error: 'grant_id, program_id, and a non-negative amount_cents are required' });
    }

    try {
      const scenario = await loadDetailedScenario(pool, orgId, scenarioId);
      if (!scenario) return res.status(404).json({ error: 'Scenario not found' });
      if (scenario.scenario_type !== 'detailed') return res.status(400).json({ error: 'Only detailed scenarios can edit grant allocations' });
      if (!(await scenarioHasForkedInputs(pool, scenarioId))) {
        return res.status(409).json({ error: 'Fork inputs before editing grant allocations for this scenario.' });
      }

      const ups = await pool.query(
        `INSERT INTO org_grant_allocations (org_id, grant_id, coop_program_id, fiscal_year, amount_cents, scenario_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (grant_id, coop_program_id, fiscal_year, COALESCE(scenario_id, -1))
           DO UPDATE SET amount_cents = EXCLUDED.amount_cents, updated_at = NOW()
         RETURNING *`,
        [orgId, grantId, programId, scenario.fiscal_year, amount, scenarioId]
      );
      await logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_grant_allocations', recordId: ups.rows[0].id,
        metadata: { ...reqMeta(req), scenario_id: scenarioId },
      });
      return res.json({ grant_allocation: { id: Number(ups.rows[0].id), grant_id: grantId, program_id: programId, amount_cents: amount } });
    } catch (e) {
      console.error('PUT .../budget-scenarios/:id/grant-allocations:', e.message);
      return res.status(500).json({ error: 'Could not set scenario grant allocation' });
    }
  });
}

module.exports = { registerScenarioInputRoutes };
