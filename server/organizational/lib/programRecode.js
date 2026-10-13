'use strict';

const RECODABLE = [
  {
    table: 'org_budget_lines',
    label: 'Budget lines',
    fkColumn: 'dimension',
    conflictCheck: true,
  },
  {
    table: 'org_grant_allocations',
    label: 'Grant allocations',
    fkColumn: 'coop_program_id',
    conflictCheck: true,
  },
  {
    table: 'org_personnel_allocations',
    label: 'Personnel allocations',
    fkColumn: 'coop_program_id',
    conflictCheck: true,
  },
  {
    table: 'org_schedule_items',
    label: 'Schedule items',
    fkColumn: 'program_id',
    conflictCheck: false,
  },
  {
    table: 'org_projections',
    label: 'Projections',
    fkColumn: 'coop_program_id',
    conflictCheck: true,
  },
  {
    table: 'org_allocation_lines',
    label: 'Indirect cost allocations',
    fkColumn: 'coop_program_id',
    conflictCheck: true,
  },
];

const CONFIG_REFS = [
  { table: 'org_bank_rules', label: 'Bank rules', fkColumn: 'action_program_id', orgColumn: 'org_id' },
  { table: 'org_sponsored_projects', label: 'Sponsored projects', fkColumn: 'program_id', orgColumn: 'sponsor_org_id' },
  { table: 'org_xero_program_track_map', label: 'Xero tracking map', fkColumn: 'coop_program_id', orgColumn: 'org_id' },
  { table: 'org_grants', label: 'Grants (primary program)', fkColumn: 'primary_program_id', orgColumn: 'org_id' },
];

const EXCLUDED = [
  { table: 'org_ledger_lines', label: 'Ledger transactions' },
  { table: 'org_bill_lines', label: 'Bills' },
  { table: 'org_invoice_lines', label: 'Invoices' },
  { table: 'org_bill_credit_notes', label: 'Bill credit notes' },
  { table: 'org_invoice_credit_notes', label: 'Invoice credit notes' },
  { table: 'org_actuals', label: 'Actuals' },
  { table: 'org_fixed_assets', label: 'Fixed assets' },
];

async function countBudgetLines(pool, orgId, programId, isActivity) {
  const col = isActivity ? 'activity_id' : 'program_id';
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_budget_lines WHERE org_id = $1 AND ${col} = $2`,
    [orgId, programId]
  );
  return r.rows[0].n;
}

async function countBudgetLineConflicts(pool, orgId, sourceId, targetId, isActivity) {
  const col = isActivity ? 'activity_id' : 'program_id';
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM org_budget_lines s
     WHERE s.org_id = $1 AND s.${col} = $2
       AND EXISTS (
         SELECT 1 FROM org_budget_lines t
         WHERE t.org_id = s.org_id AND t.${col} = $3
           AND t.account_id = s.account_id
           AND COALESCE(t.grant_id, 0) = COALESCE(s.grant_id, 0)
           AND t.fiscal_year = s.fiscal_year
           AND t.month = s.month
           AND (t.${isActivity ? 'program_id' : 'activity_id'} IS NOT DISTINCT FROM s.${isActivity ? 'program_id' : 'activity_id'})
       )`,
    [orgId, sourceId, targetId]
  );
  return r.rows[0].n;
}

async function countGeneric(pool, orgId, table, fkColumn, programId, orgColumn) {
  if (table === 'org_allocation_lines') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n FROM org_allocation_lines l
       JOIN org_allocation_schedules s ON s.id = l.coop_allocation_schedule_id
       WHERE s.org_id = $1 AND l.${fkColumn} = $2`,
      [orgId, programId]
    );
    return r.rows[0].n;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ${table} WHERE ${orgColumn || 'org_id'} = $1 AND ${fkColumn} = $2`,
    [orgId, programId]
  );
  return r.rows[0].n;
}

async function countGenericConflicts(pool, orgId, table, fkColumn, sourceId, targetId, siblingCols) {
  const eqSql = siblingCols.map((c) => `t.${c} IS NOT DISTINCT FROM s.${c}`).join(' AND ');
  if (table === 'org_allocation_lines') {
    const r = await pool.query(
      `SELECT COUNT(*)::int AS n
       FROM org_allocation_lines s
       JOIN org_allocation_schedules sch ON sch.id = s.coop_allocation_schedule_id
       WHERE sch.org_id = $1 AND s.${fkColumn} = $2
         AND EXISTS (
           SELECT 1 FROM org_allocation_lines t
           WHERE t.coop_allocation_schedule_id = s.coop_allocation_schedule_id AND t.${fkColumn} = $3 AND ${eqSql}
         )`,
      [orgId, sourceId, targetId]
    );
    return r.rows[0].n;
  }
  const r = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM ${table} s
     WHERE s.org_id = $1 AND s.${fkColumn} = $2
       AND EXISTS (
         SELECT 1 FROM ${table} t
         WHERE t.org_id = s.org_id AND t.${fkColumn} = $3 AND ${eqSql}
       )`,
    [orgId, sourceId, targetId]
  );
  return r.rows[0].n;
}

const CONFLICT_SIBLINGS = {
  org_grant_allocations: ['grant_id', 'fiscal_year', 'scenario_id'],
  org_personnel_allocations: ['coop_personnel_id'],
  org_projections: ['coop_account_id', 'fiscal_year', 'period_month'],
  org_allocation_lines: ['coop_allocation_schedule_id', 'coop_account_id'],
};

async function previewRecode(pool, orgId, sourceId, targetId, isActivity) {
  const categories = [];
  let hasConflicts = false;

  const budgetCount = await countBudgetLines(pool, orgId, sourceId, isActivity);
  const budgetConflicts = budgetCount > 0 ? await countBudgetLineConflicts(pool, orgId, sourceId, targetId, isActivity) : 0;
  if (budgetCount > 0) {
    categories.push({ table: 'org_budget_lines', label: 'Budget lines', count: budgetCount, conflicts: budgetConflicts });
    if (budgetConflicts > 0) hasConflicts = true;
  }

  for (const entry of RECODABLE) {
    if (entry.table === 'org_budget_lines') continue;
    const count = await countGeneric(pool, orgId, entry.table, entry.fkColumn, sourceId, 'org_id');
    if (count === 0) continue;
    let conflicts = 0;
    if (entry.conflictCheck && CONFLICT_SIBLINGS[entry.table]) {
      conflicts = await countGenericConflicts(
        pool, orgId, entry.table, entry.fkColumn, sourceId, targetId, CONFLICT_SIBLINGS[entry.table]
      );
    }
    categories.push({ table: entry.table, label: entry.label, count, conflicts });
    if (conflicts > 0) hasConflicts = true;
  }

  const configRefs = [];
  for (const entry of CONFIG_REFS) {
    const count = await countGeneric(pool, orgId, entry.table, entry.fkColumn, sourceId, entry.orgColumn);
    if (count > 0) configRefs.push({ table: entry.table, label: entry.label, count });
  }

  const excluded = [];
  for (const entry of EXCLUDED) {
    let count = 0;
    if (entry.table === 'org_ledger_lines') {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND l.program_id = $2`,
        [orgId, sourceId]
      );
      count = r.rows[0].n;
    } else if (entry.table === 'org_bill_lines') {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_bill_lines bl
         JOIN org_bills b ON b.id = bl.bill_id
         WHERE b.org_id = $1 AND bl.program_id = $2`,
        [orgId, sourceId]
      );
      count = r.rows[0].n;
    } else if (entry.table === 'org_invoice_lines') {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_invoice_lines il
         JOIN org_invoices i ON i.id = il.invoice_id
         WHERE i.org_id = $1 AND il.program_id = $2`,
        [orgId, sourceId]
      );
      count = r.rows[0].n;
    } else if (entry.table === 'org_actuals') {
      const r = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_actuals
         WHERE org_id = $1 AND (org_program_id = $2 OR org_activity_id = $2)`,
        [orgId, sourceId]
      );
      count = r.rows[0].n;
    } else {
      count = await countGeneric(pool, orgId, entry.table, 'program_id', sourceId, 'org_id');
    }
    if (count > 0) excluded.push({ table: entry.table, label: entry.label, count });
  }

  return {
    categories,
    configRefs,
    excluded,
    hasConflicts,
    totalRecodable: categories.reduce((s, c) => s + c.count, 0),
  };
}

/**
 * Execute: caller must have already called previewRecode and confirmed hasConflicts === false.
 * Runs inside the caller's transaction (pass the connected `client`, not `pool`) -- all UPDATEs
 * either land together or the whole thing rolls back, including on a fiscal-year-lock trigger
 * abort (SQLSTATE CA001).
 */
async function executeRecode(client, orgId, sourceId, targetId, isActivity) {
  const result = {};

  const col = isActivity ? 'activity_id' : 'program_id';
  const bl = await client.query(
    `UPDATE org_budget_lines SET ${col} = $1, updated_at = NOW() WHERE org_id = $2 AND ${col} = $3`,
    [targetId, orgId, sourceId]
  );
  result.org_budget_lines = bl.rowCount;

  for (const entry of RECODABLE) {
    if (entry.table === 'org_budget_lines') continue;
    if (entry.table === 'org_allocation_lines') {
      const r = await client.query(
        `UPDATE org_allocation_lines l SET ${entry.fkColumn} = $1
         FROM org_allocation_schedules s
         WHERE s.id = l.coop_allocation_schedule_id AND s.org_id = $2 AND l.${entry.fkColumn} = $3`,
        [targetId, orgId, sourceId]
      );
      result[entry.table] = r.rowCount;
      continue;
    }
    const r = await client.query(
      `UPDATE ${entry.table} SET ${entry.fkColumn} = $1 WHERE org_id = $2 AND ${entry.fkColumn} = $3`,
      [targetId, orgId, sourceId]
    );
    result[entry.table] = r.rowCount;
  }

  for (const entry of CONFIG_REFS) {
    const r = await client.query(
      `UPDATE ${entry.table} SET ${entry.fkColumn} = $1 WHERE ${entry.orgColumn} = $2 AND ${entry.fkColumn} = $3`,
      [targetId, orgId, sourceId]
    );
    result[entry.table] = r.rowCount;
  }

  return result;
}

module.exports = { previewRecode, executeRecode, RECODABLE, CONFIG_REFS, EXCLUDED };
