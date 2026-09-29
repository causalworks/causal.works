'use strict';

const { calculatePersonnelProjections } = require('./personnelCalculator');
const { recalcPersonnelBudget } = require('./personnelRecalc');

/**
 * Cross-FY carryforward for ongoing personnel (Phase 1 of multi-year budget
 * planning). Unlike insurance/grants, a personnel record has no contractual
 * end date driving this — the signal is simply "this position is still
 * active at FY end and next year has no row for it yet." Carries the
 * position forward at the *same* salary/FTE/fringe settings (no raise) so
 * next year's personnel budget starts from something real instead of blank,
 * while the actual raise pass still happens deliberately — via the
 * personnel-bulk-editor skill or manual edits — against these pre-populated
 * rows rather than from-scratch entry.
 *
 * A position with end_month set to anything before 12 is explicitly leaving
 * mid-year and is never carried forward (and any previously auto-generated
 * carryforward row for it is removed, in case the departure was added
 * after the row was already spawned).
 *
 * Since org_personnel has no natural cross-year identity column, matching
 * "the same position" across fiscal years is done by payroll_id when
 * present, else by (full_name, salary/contractor account). This is also
 * what keeps this idempotent against the existing manual
 * copy-from-prior-year bulk tool — if a row for that identity already
 * exists next year (auto-generated or manual), this never creates a
 * second one.
 */

function identityKey(row) {
  if (row.payroll_id) return `payroll:${row.payroll_id}`;
  const acct = row.salary_account_id || row.contractor_account_id || '';
  return `name:${String(row.full_name || '').trim().toLowerCase()}|acct:${acct}`;
}

async function copyPersonnelAllocations(pool, fromPersonnelId, toPersonnelId) {
  const { rows } = await pool.query(
    `SELECT coop_program_id, percent_bps FROM org_personnel_allocations WHERE coop_personnel_id=$1`,
    [fromPersonnelId]
  );
  for (const a of rows) {
    await pool.query(
      `INSERT INTO org_personnel_allocations (coop_personnel_id, org_id, coop_program_id, percent_bps)
       SELECT $1, org_id, $2, $3 FROM org_personnel WHERE id=$1
       ON CONFLICT DO NOTHING`,
      [toPersonnelId, a.coop_program_id, a.percent_bps]
    );
  }
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {object} worker full org_personnel row just created/updated
 * @param {number|null} userId acting user, for created_by/projection attribution
 */
async function syncPersonnelCarryforward(pool, orgId, worker, userId) {
  const isOngoing = worker.end_month == null || Number(worker.end_month) === 12;
  const nextFY = Number(worker.fiscal_year) + 1;
  const key = identityKey(worker);

  const { rows: nextYearRows } = await pool.query(
    `SELECT * FROM org_personnel WHERE org_id=$1 AND fiscal_year=$2`,
    [orgId, nextFY]
  );
  const existing = nextYearRows.find(r => identityKey(r) === key) || null;

  if (!isOngoing) {
    if (existing && existing.auto_generated) {
      await pool.query(`DELETE FROM org_personnel WHERE id=$1 AND org_id=$2`, [existing.id, orgId]);
      await calculatePersonnelProjections(pool, orgId, nextFY, userId);
      await recalcPersonnelBudget(pool, orgId, nextFY);
      return { touchedFYs: [nextFY] };
    }
    return { touchedFYs: [] };
  }

  if (existing) {
    // A row for this position already exists next year (manual or a prior
    // auto-generated one) — never overwrite or duplicate it.
    return { touchedFYs: [] };
  }

  const { rows: insRows } = await pool.query(
    `INSERT INTO org_personnel
       (org_id, fiscal_year, worker_type, full_name, title,
        salary_account_id, annual_salary_cents, fte_bps, start_month, end_month,
        health_tier, employment_type, contract_type, payroll_id, department_code,
        flsa_status, use_custom_fringe, custom_suta_rate_bps, custom_workers_comp_rate_bps, custom_retirement_rate_bps,
        custom_dental_vision_monthly_cents, custom_disability_rate_bps, custom_other_monthly_cents, contractor_account_id, monthly_fee_cents,
        notes, created_by, updated_by, auto_generated)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,12,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$25,TRUE)
     RETURNING id`,
    [
      orgId, nextFY, worker.worker_type, worker.full_name, worker.title,
      worker.salary_account_id, worker.annual_salary_cents, worker.fte_bps,
      worker.health_tier, worker.employment_type, worker.contract_type, worker.payroll_id, worker.department_code,
      worker.flsa_status, worker.use_custom_fringe, worker.custom_suta_rate_bps, worker.custom_workers_comp_rate_bps,
      worker.custom_retirement_rate_bps, worker.custom_dental_vision_monthly_cents,
      worker.custom_disability_rate_bps, worker.custom_other_monthly_cents,
      worker.contractor_account_id, worker.monthly_fee_cents, worker.notes, userId,
    ]
  );

  const newId = insRows[0].id;
  await copyPersonnelAllocations(pool, worker.id, newId);
  await calculatePersonnelProjections(pool, orgId, nextFY, userId);
  await recalcPersonnelBudget(pool, orgId, nextFY);
  return { touchedFYs: [nextFY] };
}

/**
 * Call when a worker row is deleted outright — if it had an auto-generated
 * carryforward clone in fiscal_year+1, that clone's origin no longer
 * exists, so remove it too.
 */
async function cleanupPersonnelCarryforward(pool, orgId, deletedWorker, userId) {
  const nextFY = Number(deletedWorker.fiscal_year) + 1;
  const key = identityKey(deletedWorker);
  const { rows: nextYearRows } = await pool.query(
    `SELECT * FROM org_personnel WHERE org_id=$1 AND fiscal_year=$2`,
    [orgId, nextFY]
  );
  const existing = nextYearRows.find(r => identityKey(r) === key) || null;
  if (existing && existing.auto_generated) {
    await pool.query(`DELETE FROM org_personnel WHERE id=$1 AND org_id=$2`, [existing.id, orgId]);
    await calculatePersonnelProjections(pool, orgId, nextFY, userId);
    await recalcPersonnelBudget(pool, orgId, nextFY);
  }
}

module.exports = { syncPersonnelCarryforward, cleanupPersonnelCarryforward };
