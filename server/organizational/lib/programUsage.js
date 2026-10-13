'use strict';

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
