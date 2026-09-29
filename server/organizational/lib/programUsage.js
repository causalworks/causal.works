'use strict';

/**
 * Checks whether a program or activity (org_programs row -- both dimensions share the same
 * table, an activity is just a row with parent_id set) has any real financial data recorded
 * against it. Used to block deactivating a program/activity that has history, and to restrict
 * edits on one that does to a rename only -- see programs.js's PATCH handler.
 *
 * Deliberately scoped to tables that represent recorded activity (budget lines, actuals,
 * ledger postings, bill/invoice lines and their credit notes, grant/personnel/indirect-cost
 * allocations, schedule items, fixed assets) -- not pure configuration that merely points at a
 * program (org_bank_rules.action_program_id, org_sponsored_projects.program_id,
 * org_xero_program_track_map, org_grants.primary_program_id). Those are real references too,
 * but reassigning them doesn't lose history the way deactivating a program with actual
 * transactions would.
 *
 * `program_id`/`activity_id` are checked together wherever a table has both columns
 * (org_budget_lines, org_actuals) -- a program can be referenced either as the top-level
 * program or as one of its own activities, and both count as usage of this row.
 */
async function getProgramUsage(pool, orgId, programId) {
  const r = await pool.query(
    `SELECT
       EXISTS(SELECT 1 FROM org_budget_lines WHERE org_id = $1 AND (program_id = $2 OR activity_id = $2)) AS budget_lines,
       EXISTS(SELECT 1 FROM org_actuals WHERE org_id = $1 AND (org_program_id = $2 OR org_activity_id = $2)) AS actuals,
       EXISTS(SELECT 1 FROM org_ledger_lines WHERE program_id = $2) AS ledger_lines,
       EXISTS(SELECT 1 FROM org_bill_lines WHERE program_id = $2) AS bill_lines,
       EXISTS(SELECT 1 FROM org_invoice_lines WHERE program_id = $2) AS invoice_lines,
       EXISTS(SELECT 1 FROM org_bill_credit_notes WHERE org_id = $1 AND program_id = $2) AS bill_credit_notes,
       EXISTS(SELECT 1 FROM org_invoice_credit_notes WHERE org_id = $1 AND program_id = $2) AS invoice_credit_notes,
       EXISTS(SELECT 1 FROM org_grant_allocations WHERE org_id = $1 AND coop_program_id = $2) AS grant_allocations,
       EXISTS(SELECT 1 FROM org_personnel_allocations WHERE org_id = $1 AND coop_program_id = $2) AS personnel_allocations,
       EXISTS(SELECT 1 FROM org_schedule_items WHERE org_id = $1 AND program_id = $2) AS schedule_items,
       EXISTS(SELECT 1 FROM org_fixed_assets WHERE org_id = $1 AND program_id = $2) AS fixed_assets,
       EXISTS(SELECT 1 FROM org_projections WHERE org_id = $1 AND coop_program_id = $2) AS projections,
       EXISTS(SELECT 1 FROM org_allocation_lines WHERE coop_program_id = $2) AS allocation_lines`,
    [orgId, programId]
  );
  const row = r.rows[0] || {};
  const labels = {
    budget_lines: 'Budget lines',
    actuals: 'Actuals',
    ledger_lines: 'Ledger transactions',
    bill_lines: 'Bills',
    invoice_lines: 'Invoices',
    bill_credit_notes: 'Bill credit notes',
    invoice_credit_notes: 'Invoice credit notes',
    grant_allocations: 'Grant allocations',
    personnel_allocations: 'Personnel allocations',
    schedule_items: 'Schedule items',
    fixed_assets: 'Fixed assets',
    projections: 'Projections',
    allocation_lines: 'Indirect cost allocations',
  };
  const categories = Object.keys(labels).filter((k) => row[k]).map((k) => labels[k]);
  return { hasUsage: categories.length > 0, categories };
}

module.exports = { getProgramUsage };
