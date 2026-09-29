'use strict';

const { fiscalYearForDate, getFiscalYearEndMonth } = require('./fiscalYear');
const { recalcGrantBudget } = require('./grantRecalc');

/**
 * Cross-FY carryforward for multi-year grants (Phase 1 of multi-year budget
 * planning). A grant with a known award amount + award period spanning more
 * than one fiscal year is a real, already-committed multi-year obligation —
 * once the org knows a $150K grant covers FY25-27, that's known money, not a
 * budgeting guess. This auto-fills an even-split allocation for any spanned
 * FY that has no allocation row at all yet, so multi-year grants don't sit
 * as an empty "FY27 —" gap in the coverage indicator until someone
 * remembers to go add it.
 *
 * Only fills FYs with ZERO existing allocation rows (any program) — never
 * touches a FY a human has already allocated, auto-generated or not, since
 * a partial manual entry means the org has already made a real decision
 * about that year's split that shouldn't be second-guessed by an even
 * split of the total.
 *
 * Auto-generated rows are marked auto_generated=TRUE; the grants/allocations
 * routes flip that to FALSE the moment a human edits that row directly.
 */

const CARRYFORWARD_INELIGIBLE_STATUSES = new Set(['declined', 'closed']);

async function getOrgFyEndMonth(pool, orgId) {
  const m = await getFiscalYearEndMonth(pool, orgId);
  return m || 12;
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {object} grant full org_grants row (needs id, revenue_account_id,
 *   primary_program_id, amount_cents, period_start_date, period_end_date, status)
 */
async function syncGrantAllocationCarryforward(pool, orgId, grant) {
  const qualifies =
    grant &&
    grant.revenue_account_id &&
    grant.primary_program_id &&
    grant.amount_cents != null && Number(grant.amount_cents) > 0 &&
    grant.period_start_date && grant.period_end_date &&
    !CARRYFORWARD_INELIGIBLE_STATUSES.has(grant.status);

  const touchedFYs = new Set();

  if (!qualifies) {
    // Doesn't (or no longer) qualifies — remove any auto-generated rows this
    // grant previously spawned; a human can always re-add manually.
    const { rows } = await pool.query(
      `DELETE FROM org_grant_allocations WHERE grant_id=$1 AND org_id=$2 AND auto_generated=TRUE RETURNING fiscal_year`,
      [grant.id, orgId]
    );
    for (const r of rows) touchedFYs.add(r.fiscal_year);
    for (const fy of touchedFYs) await recalcGrantBudget(pool, orgId, fy);
    return { touchedFYs: [...touchedFYs] };
  }

  const fyEndMonth = await getOrgFyEndMonth(pool, orgId);
  const firstFY = fiscalYearForDate(grant.period_start_date, fyEndMonth);
  const lastFY = fiscalYearForDate(grant.period_end_date, fyEndMonth);
  if (lastFY < firstFY) return { touchedFYs: [] };

  const spanLen = lastFY - firstFY + 1;
  const perFYCents = Math.round(Number(grant.amount_cents) / spanLen);

  // Remove auto-generated rows now outside the (possibly changed) span.
  const { rows: removed } = await pool.query(
    `DELETE FROM org_grant_allocations
     WHERE grant_id=$1 AND org_id=$2 AND auto_generated=TRUE
       AND (fiscal_year < $3 OR fiscal_year > $4)
     RETURNING fiscal_year`,
    [grant.id, orgId, firstFY, lastFY]
  );
  for (const r of removed) touchedFYs.add(r.fiscal_year);

  // Which spanned FYs already have ANY allocation (manual or auto)?
  const { rows: existingRows } = await pool.query(
    `SELECT DISTINCT fiscal_year FROM org_grant_allocations
     WHERE grant_id=$1 AND org_id=$2 AND fiscal_year BETWEEN $3 AND $4`,
    [grant.id, orgId, firstFY, lastFY]
  );
  const covered = new Set(existingRows.map(r => r.fiscal_year));

  for (let fy = firstFY; fy <= lastFY; fy++) {
    if (covered.has(fy)) continue;
    await pool.query(
      `INSERT INTO org_grant_allocations (org_id, grant_id, coop_program_id, fiscal_year, amount_cents, auto_generated)
       VALUES ($1,$2,$3,$4,$5,TRUE)
       ON CONFLICT (grant_id, coop_program_id, fiscal_year) DO NOTHING`,
      [orgId, grant.id, grant.primary_program_id, fy, perFYCents]
    );
    touchedFYs.add(fy);
  }

  for (const fy of touchedFYs) await recalcGrantBudget(pool, orgId, fy);
  return { touchedFYs: [...touchedFYs] };
}

module.exports = { syncGrantAllocationCarryforward };
