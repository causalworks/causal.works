'use strict';

// FICA employer rate is a federal constant (7.65%): Social Security 6.2% + Medicare 1.45%
const FICA_RATE_BPS = 765;

/**
 * Given a worker row (with allocations and fringe settings), compute monthly projections
 * for each affected account broken down by program.
 *
 * Returns an array of { account_id, program_id, month, amount_cents } objects
 * covering every active month for this worker.
 *
 * Fringe account IDs must be resolved from the org's COA by standard_category before calling.
 */
function calculateWorkerProjections(worker, allocations, fringe, fringeAccountIds) {
  const results = [];
  if (!allocations || allocations.length === 0) return results;

  const startMonth = worker.start_month || 1;
  const endMonth   = worker.end_month   || 12;
  // Fiscal years can span two calendar years (e.g. July→June: startMonth=7, endMonth=6).
  // activeMonths counts correctly in both cases; month sequence wraps via modular arithmetic.
  const activeMonths = startMonth <= endMonth
    ? endMonth - startMonth + 1
    : 12 - startMonth + 1 + endMonth;

  // ---- CONTRACTOR ----
  if (worker.worker_type === 'contractor') {
    if (!worker.monthly_fee_cents || !worker.contractor_account_id) return results;
    for (let i = 0; i < activeMonths; i++) {
      const m = ((startMonth - 1 + i) % 12) + 1;
      for (const alloc of allocations) {
        const amt = Math.round(worker.monthly_fee_cents * alloc.percent_bps / 10000);
        if (amt !== 0) {
          results.push({
            account_id: worker.contractor_account_id,
            program_id: alloc.coop_program_id,
            month: m,
            amount_cents: amt,
          });
        }
      }
    }
    return results;
  }

  // ---- EMPLOYEE ----
  if (!worker.annual_salary_cents || !worker.salary_account_id) return results;

  const fteBps = worker.fte_bps != null ? worker.fte_bps : 10000; // default 1.0 FTE
  // Effective annual salary prorated by FTE
  const effectiveAnnualCents = Math.round(worker.annual_salary_cents * fteBps / 10000);
  // Monthly salary (floor each month; last month gets remainder)
  const monthlyBase = Math.floor(effectiveAnnualCents * activeMonths / 12 / activeMonths);
  const lastMonthAdj = (effectiveAnnualCents * activeMonths / 12) - (monthlyBase * activeMonths);

  // Fringe rates — use custom overrides if set, else org defaults
  const useCustom = !!worker.use_custom_fringe;
  const sutaRateBps        = useCustom && worker.custom_suta_rate_bps       != null ? worker.custom_suta_rate_bps       : fringe.suta_rate_bps;
  const sutaWageBaseCents  = fringe.suta_wage_base_cents; // always org-level (state-set)
  const wcRateBps          = useCustom && worker.custom_workers_comp_rate_bps != null ? worker.custom_workers_comp_rate_bps : fringe.workers_comp_rate_bps;
  const retirementRateBps  = useCustom && worker.custom_retirement_rate_bps  != null ? worker.custom_retirement_rate_bps  : fringe.retirement_rate_bps;
  const dvMonthlyCents     = useCustom && worker.custom_dental_vision_monthly_cents != null ? worker.custom_dental_vision_monthly_cents : fringe.dental_vision_monthly_cents;
  const disabilityRateBps  = useCustom && worker.custom_disability_rate_bps  != null ? worker.custom_disability_rate_bps  : fringe.disability_rate_bps;
  const otherMonthlyCents  = useCustom && worker.custom_other_monthly_cents  != null ? worker.custom_other_monthly_cents  : fringe.other_monthly_cents;

  // Health: per-person monthly amount (NOT FTE-prorated)
  let healthMonthlyCents = 0;
  const tier = worker.health_tier || 'none';
  if (tier === 'employee') healthMonthlyCents = fringe.health_ee_monthly_cents;
  else if (tier === 'spouse') healthMonthlyCents = fringe.health_ee_spouse_monthly_cents;
  else if (tier === 'family') healthMonthlyCents = fringe.health_ee_family_monthly_cents;

  // Running totals for wage-base caps
  let sutaWageAccumCents = 0;
  let ssWageAccumCents   = 0;
  const ssWageBaseCents  = fringe.ss_wage_base_cents;

  for (let i = 0; i < activeMonths; i++) {
    const m = ((startMonth - 1 + i) % 12) + 1;
    const isLastMonth = i === activeMonths - 1;
    const salaryThisMonth = isLastMonth
      ? monthlyBase + Math.round(lastMonthAdj)
      : monthlyBase;

    // --- SALARY ---
    spreadByProgram(results, allocations, worker.salary_account_id, m, salaryThisMonth);

    // --- FICA (capped at SS wage base) ---
    if (fringeAccountIds.fica) {
      const ssEligibleThisMonth = Math.min(
        salaryThisMonth,
        Math.max(0, ssWageBaseCents - ssWageAccumCents)
      );
      const ficaThisMonth = Math.round(ssEligibleThisMonth * FICA_RATE_BPS / 10000);
      ssWageAccumCents += salaryThisMonth;
      spreadByProgram(results, allocations, fringeAccountIds.fica, m, ficaThisMonth);
    }

    // --- SUTA (capped at state wage base) ---
    if (fringeAccountIds.suta && sutaRateBps > 0) {
      const sutaEligibleThisMonth = Math.min(
        salaryThisMonth,
        Math.max(0, sutaWageBaseCents - sutaWageAccumCents)
      );
      const sutaThisMonth = Math.round(sutaEligibleThisMonth * sutaRateBps / 10000);
      sutaWageAccumCents += salaryThisMonth;
      spreadByProgram(results, allocations, fringeAccountIds.suta, m, sutaThisMonth);
    }

    // --- WORKERS' COMP (prorated by FTE, based on effective salary) ---
    if (fringeAccountIds.workersComp && wcRateBps > 0) {
      const wcThisMonth = Math.round(salaryThisMonth * wcRateBps / 10000);
      spreadByProgram(results, allocations, fringeAccountIds.workersComp, m, wcThisMonth);
    }

    // --- RETIREMENT (prorated by FTE) ---
    if (fringeAccountIds.retirement && retirementRateBps > 0) {
      const retThisMonth = Math.round(salaryThisMonth * retirementRateBps / 10000);
      spreadByProgram(results, allocations, fringeAccountIds.retirement, m, retThisMonth);
    }

    // --- DISABILITY (prorated by FTE) ---
    if (fringeAccountIds.disability && disabilityRateBps > 0) {
      const disThisMonth = Math.round(salaryThisMonth * disabilityRateBps / 10000);
      spreadByProgram(results, allocations, fringeAccountIds.disability, m, disThisMonth);
    }

    // --- HEALTH (flat per person, not FTE-prorated) ---
    if (fringeAccountIds.health && healthMonthlyCents > 0) {
      spreadByProgram(results, allocations, fringeAccountIds.health, m, healthMonthlyCents);
    }

    // --- DENTAL/VISION (flat per person) ---
    if (fringeAccountIds.dentalVision && dvMonthlyCents > 0) {
      spreadByProgram(results, allocations, fringeAccountIds.dentalVision, m, dvMonthlyCents);
    }

    // --- OTHER FRINGE (flat per person) ---
    if (fringeAccountIds.otherFringe && otherMonthlyCents > 0) {
      spreadByProgram(results, allocations, fringeAccountIds.otherFringe, m, otherMonthlyCents);
    }
  }

  return results;
}

function spreadByProgram(results, allocations, accountId, month, totalCents) {
  if (!totalCents) return;
  let distributed = 0;
  for (let i = 0; i < allocations.length; i++) {
    const alloc = allocations[i];
    const isLast = i === allocations.length - 1;
    const amt = isLast
      ? totalCents - distributed
      : Math.round(totalCents * alloc.percent_bps / 10000);
    distributed += amt;
    if (amt !== 0) {
      results.push({ account_id: accountId, program_id: alloc.coop_program_id, month, amount_cents: amt });
    }
  }
}

/**
 * Resolve fringe account IDs from org_fringe_settings account link columns.
 * Returns an object keyed by fringe type; values are null if the mapping is unset.
 */
function resolveFringeAccountIds(fringeRow) {
  return {
    fica:        fringeRow.fica_account_id         || null,
    suta:        fringeRow.suta_account_id          || null,
    workersComp: fringeRow.workers_comp_account_id  || null,
    retirement:  fringeRow.retirement_account_id    || null,
    disability:  fringeRow.disability_account_id    || null,
    health:      fringeRow.health_account_id        || null,
    dentalVision:fringeRow.dental_vision_account_id || null,
    otherFringe: fringeRow.other_fringe_account_id  || null,
  };
}

/**
 * Main entry point.
 * Calculates projections for all personnel in a fiscal year, then upserts them into org_projections.
 * Existing personnel-sourced projections for the FY are replaced atomically.
 *
 * Returns { workers_processed, projections_written }.
 */
async function calculatePersonnelProjections(pool, orgId, fiscalYear, userId) {
  // Load fringe settings (auto-create defaults if missing)
  let fringeRow = (await pool.query(
    `SELECT * FROM org_fringe_settings WHERE org_id = $1 LIMIT 1`, [orgId]
  )).rows[0];
  if (!fringeRow) {
    fringeRow = (await pool.query(
      `INSERT INTO org_fringe_settings (org_id) VALUES ($1) RETURNING *`, [orgId]
    )).rows[0];
  }

  // Load all workers for the FY
  const workersRes = await pool.query(
    `SELECT * FROM org_personnel WHERE org_id = $1 AND fiscal_year = $2 ORDER BY id`,
    [orgId, fiscalYear]
  );
  const workers = workersRes.rows;
  if (workers.length === 0) return { workers_processed: 0, projections_written: 0 };

  // Load all allocations for these workers
  const workerIds = workers.map(w => w.id);
  const allocsRes = await pool.query(
    `SELECT * FROM org_personnel_allocations WHERE coop_personnel_id = ANY($1::bigint[]) ORDER BY coop_personnel_id, id`,
    [workerIds]
  );
  const allocsByWorker = {};
  for (const a of allocsRes.rows) {
    const key = String(a.coop_personnel_id);
    (allocsByWorker[key] = allocsByWorker[key] || []).push(a);
  }

  // Resolve fringe account IDs from fringe settings account link columns
  const fringeAccountIds = resolveFringeAccountIds(fringeRow);

  // Compute projections for each worker
  const allLines = []; // { account_id, program_id, month, amount_cents }
  for (const w of workers) {
    const allocations = allocsByWorker[String(w.id)] || [];
    const lines = calculateWorkerProjections(w, allocations, fringeRow, fringeAccountIds);
    allLines.push(...lines);
  }

  // Aggregate: sum by (account_id, program_id, month)
  const aggMap = new Map();
  for (const line of allLines) {
    const key = `${line.account_id}:${line.program_id}:${line.month}`;
    aggMap.set(key, (aggMap.get(key) || { ...line, amount_cents: 0 }));
    aggMap.get(key).amount_cents += line.amount_cents;
  }

  // Write to org_projections using upsert
  // Tag with notes = 'personnel-schedule' so we can identify & replace them
  const client = await pool.connect();
  let written = 0;
  try {
    await client.query('BEGIN');
    // Delete existing personnel-schedule projections for this FY
    await client.query(
      `DELETE FROM org_projections
       WHERE org_id = $1 AND fiscal_year = $2 AND notes = 'personnel-schedule'`,
      [orgId, fiscalYear]
    );
    // Insert new ones
    for (const entry of aggMap.values()) {
      if (!entry.amount_cents) continue;
      // Personnel always writes monthly rows (period_month 1–12, never null)
      await client.query(
        `INSERT INTO org_projections
           (org_id, coop_account_id, coop_program_id, fiscal_year, period_month, amount_cents, notes, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'personnel-schedule', $7, $7)`,
        [orgId, entry.account_id, entry.program_id, fiscalYear, entry.month, entry.amount_cents, userId]
      );
      written++;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return { workers_processed: workers.length, projections_written: written };
}

module.exports = { calculatePersonnelProjections, calculateWorkerProjections, resolveFringeAccountIds };
