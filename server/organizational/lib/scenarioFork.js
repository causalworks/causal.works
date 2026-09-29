'use strict';

/**
 * Fork and promote logic for "detailed" scenarios -- copying live personnel/schedule/
 * grant-allocation rows into a scenario's own scope, and copying them back over live at
 * promotion time. See .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md.
 *
 * org_grants itself (identity/status) is never forked -- a detailed scenario can only model
 * allocation changes against existing live grants, not hypothetical new ones (see spec).
 */

const PERSONNEL_COLUMNS = [
  'worker_type', 'full_name', 'title', 'salary_account_id', 'annual_salary_cents', 'fte_bps',
  'start_month', 'end_month', 'health_tier', 'use_custom_fringe', 'custom_suta_rate_bps',
  'custom_workers_comp_rate_bps', 'custom_retirement_rate_bps', 'custom_dental_vision_monthly_cents',
  'custom_disability_rate_bps', 'custom_other_monthly_cents', 'contractor_account_id',
  'monthly_fee_cents', 'notes', 'employment_type', 'contract_type', 'payroll_id',
  'department_code', 'flsa_status',
];

const SCHEDULE_ITEM_COLUMNS = [
  'account_id', 'program_id', 'grant_id', 'label', 'schedule_type', 'quantity',
  'unit_amount_cents', 'frequency', 'active_months', 'start_month', 'end_month',
  'notes', 'sort_order', 'named_schedule_id', 'policy_start_date', 'policy_end_date',
];

/** True if a scenario already has any forked rows in any of the three input tables. */
async function scenarioHasForkedInputs(pool, scenarioId) {
  const r = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM org_personnel WHERE scenario_id = $1) OR
       EXISTS(SELECT 1 FROM org_schedule_items WHERE scenario_id = $1) OR
       EXISTS(SELECT 1 FROM org_grant_allocations WHERE scenario_id = $1) AS has_inputs`,
    [scenarioId]
  );
  return !!r.rows[0]?.has_inputs;
}

/**
 * Copies every live (scenario_id IS NULL) personnel/schedule-item/grant-allocation row for the
 * org+FY into the scenario's own scope. One-time action -- callers should check
 * scenarioHasForkedInputs first and refuse a second fork (re-forking would silently discard any
 * edits already made inside the scenario).
 */
async function forkScenarioInputs(pool, { orgId, scenarioId, fiscalYear, userId }) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Personnel: fork parent rows first (need old->new id map for allocations), then their
    // allocation rows. Row counts here are always small (real orgs run dozens, not thousands).
    const workers = (await client.query(
      `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear]
    )).rows;
    const personnelIdMap = new Map();
    for (const w of workers) {
      const cols = PERSONNEL_COLUMNS.map((c, i) => `$${i + 5}`).join(', ');
      const ins = await client.query(
        `INSERT INTO org_personnel (org_id, fiscal_year, scenario_id, created_by, updated_by, ${PERSONNEL_COLUMNS.join(', ')})
         VALUES ($1, $2, $3, $4, $4, ${cols})
         RETURNING id`,
        [orgId, fiscalYear, scenarioId, userId, ...PERSONNEL_COLUMNS.map(c => w[c])]
      );
      personnelIdMap.set(w.id, ins.rows[0].id);
    }
    if (workers.length) {
      const allocs = (await client.query(
        `SELECT * FROM org_personnel_allocations WHERE coop_personnel_id = ANY($1::bigint[])`,
        [workers.map(w => w.id)]
      )).rows;
      for (const a of allocs) {
        const newPersonnelId = personnelIdMap.get(a.coop_personnel_id);
        if (!newPersonnelId) continue;
        await client.query(
          `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
           VALUES ($1, $2, $3, $4)`,
          [newPersonnelId, orgId, a.coop_program_id, a.percent_bps]
        );
      }
    }

    // Schedule items: same parent-then-children pattern.
    const items = (await client.query(
      `SELECT * FROM org_schedule_items WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear]
    )).rows;
    const itemIdMap = new Map();
    for (const it of items) {
      const cols = SCHEDULE_ITEM_COLUMNS.map((c, i) => `$${i + 4}`).join(', ');
      const ins = await client.query(
        `INSERT INTO org_schedule_items (org_id, fiscal_year, scenario_id, ${SCHEDULE_ITEM_COLUMNS.join(', ')})
         VALUES ($1, $2, $3, ${cols})
         RETURNING id`,
        [orgId, fiscalYear, scenarioId, ...SCHEDULE_ITEM_COLUMNS.map(c => it[c])]
      );
      itemIdMap.set(it.id, ins.rows[0].id);
    }
    if (items.length) {
      const allocs = (await client.query(
        `SELECT * FROM org_schedule_item_allocations WHERE coop_schedule_item_id = ANY($1::bigint[])`,
        [items.map(it => it.id)]
      )).rows;
      for (const a of allocs) {
        const newItemId = itemIdMap.get(a.coop_schedule_item_id);
        if (!newItemId) continue;
        await client.query(
          `INSERT INTO org_schedule_item_allocations (coop_schedule_item_id, org_id, coop_program_id, percent_bps)
           VALUES ($1, $2, $3, $4)`,
          [newItemId, orgId, a.coop_program_id, a.percent_bps]
        );
      }
    }

    // Grant allocations: no child table, plain copy with scenario_id set.
    const grantAllocResult = await client.query(
      `INSERT INTO org_grant_allocations (org_id, grant_id, coop_program_id, fiscal_year, amount_cents, notes, scenario_id)
       SELECT org_id, grant_id, coop_program_id, fiscal_year, amount_cents, notes, $3
       FROM org_grant_allocations
       WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear, scenarioId]
    );

    await client.query('COMMIT');
    return {
      personnel_forked: workers.length,
      schedule_items_forked: items.length,
      grant_allocations_forked: grantAllocResult.rowCount || 0,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Promotion step 2 (see spec): copies a scenario's forked input rows over the live rows for
 * the same org+FY, for the given sub-ledger sources only. Caller runs this inside its own
 * transaction and re-runs the live recalc engines afterward -- this function only touches the
 * input tables, never org_budget_lines.
 */
async function promoteScenarioInputs(client, { orgId, scenarioId, fiscalYear, sources }) {
  const result = { personnel: 0, schedule: 0, grant_allocation: 0 };

  if (sources.includes('personnel')) {
    const workers = (await client.query(
      `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id = $3`,
      [orgId, fiscalYear, scenarioId]
    )).rows;
    await client.query(
      `DELETE FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear]
    );
    for (const w of workers) {
      const cols = PERSONNEL_COLUMNS.map((c, i) => `$${i + 3}`).join(', ');
      const ins = await client.query(
        `INSERT INTO org_personnel (org_id, fiscal_year, scenario_id, ${PERSONNEL_COLUMNS.join(', ')})
         VALUES ($1, $2, NULL, ${cols})
         RETURNING id`,
        [orgId, fiscalYear, ...PERSONNEL_COLUMNS.map(c => w[c])]
      );
      const allocs = (await client.query(
        `SELECT * FROM org_personnel_allocations WHERE coop_personnel_id = $1`, [w.id]
      )).rows;
      for (const a of allocs) {
        await client.query(
          `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
           VALUES ($1, $2, $3, $4)`,
          [ins.rows[0].id, orgId, a.coop_program_id, a.percent_bps]
        );
      }
      result.personnel++;
    }
  }

  if (sources.includes('schedule')) {
    const items = (await client.query(
      `SELECT * FROM org_schedule_items WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id = $3`,
      [orgId, fiscalYear, scenarioId]
    )).rows;
    await client.query(
      `DELETE FROM org_schedule_items WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear]
    );
    for (const it of items) {
      const cols = SCHEDULE_ITEM_COLUMNS.map((c, i) => `$${i + 3}`).join(', ');
      const ins = await client.query(
        `INSERT INTO org_schedule_items (org_id, fiscal_year, scenario_id, ${SCHEDULE_ITEM_COLUMNS.join(', ')})
         VALUES ($1, $2, NULL, ${cols})
         RETURNING id`,
        [orgId, fiscalYear, ...SCHEDULE_ITEM_COLUMNS.map(c => it[c])]
      );
      const allocs = (await client.query(
        `SELECT * FROM org_schedule_item_allocations WHERE coop_schedule_item_id = $1`, [it.id]
      )).rows;
      for (const a of allocs) {
        await client.query(
          `INSERT INTO org_schedule_item_allocations (coop_schedule_item_id, org_id, coop_program_id, percent_bps)
           VALUES ($1, $2, $3, $4)`,
          [ins.rows[0].id, orgId, a.coop_program_id, a.percent_bps]
        );
      }
      result.schedule++;
    }
  }

  if (sources.includes('grant_allocation')) {
    await client.query(
      `DELETE FROM org_grant_allocations WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id IS NULL`,
      [orgId, fiscalYear]
    );
    const ins = await client.query(
      `INSERT INTO org_grant_allocations (org_id, grant_id, coop_program_id, fiscal_year, amount_cents, notes, scenario_id)
       SELECT org_id, grant_id, coop_program_id, fiscal_year, amount_cents, notes, NULL
       FROM org_grant_allocations
       WHERE org_id = $1 AND fiscal_year = $2 AND scenario_id = $3`,
      [orgId, fiscalYear, scenarioId]
    );
    result.grant_allocation = ins.rowCount || 0;
  }

  return result;
}

module.exports = { scenarioHasForkedInputs, forkScenarioInputs, promoteScenarioInputs };
