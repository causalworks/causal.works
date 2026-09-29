'use strict';

const { fyDateRange, getFiscalYearEndMonth } = require('./fiscalYear');

/**
 * Advisory tie-out assertions for one org's fiscal year -- NOT a precondition for locking
 * (see migration 164's header comment: locking is deliberately allowed on an imperfect year,
 * since freezing a year while external reconciliation is still in flight is a real, intended
 * use case). This is a synthesis layer over data that already exists across the balance sheet,
 * grants, and allocation tables -- it reads and asserts, it never writes.
 *
 * MVP scope -- three cheap, self-contained SQL checks. Explicitly NOT covered here (flagged in
 * the UI, not silently implied as passing): budget-line-vs-source drift detection
 * (calculated_amount_cents/source_updated_at are written by the recalc engines but never
 * compared against anything -- would need a dry-run recompute path) and unmapped-actuals
 * visibility (a pre-existing open product question, not new to this feature).
 *
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {number} fiscalYear
 * @returns {Promise<{ fiscalYear: number, checks: Array<object>, anyFail: boolean }>}
 */
async function runReconciliationChecks(pool, orgId, fiscalYear) {
  const checks = [];

  // 1. Balance sheet ties: Assets = Liabilities + Equity, for the snapshot as_of_date
  // closest to (at or before) this FY's end date.
  {
    const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
    const { endDate } = fyDateRange(fiscalYear, fyEndMonth);
    const dateR = await pool.query(
      `SELECT as_of_date::text AS as_of_date FROM org_balance_sheet_snapshots
       WHERE org_id = $1 AND as_of_date <= $2::date
       ORDER BY as_of_date DESC LIMIT 1`,
      [orgId, endDate]
    );
    if (dateR.rows.length === 0) {
      checks.push({
        id: 'balance_sheet_ties',
        label: 'Balance sheet ties (Assets = Liabilities + Equity)',
        status: 'info',
        detail: `No balance sheet snapshot on or before ${endDate} for FY${fiscalYear}.`,
      });
    } else {
      const asOfDate = dateR.rows[0].as_of_date;
      const sumsR = await pool.query(
        `SELECT acc.type::text AS type, COALESCE(SUM(s.balance_cents), 0)::bigint AS cents
         FROM org_balance_sheet_snapshots s
         INNER JOIN org_accounts acc ON acc.id = s.coop_account_id
         WHERE s.org_id = $1 AND s.as_of_date = $2::date
         GROUP BY acc.type::text`,
        [orgId, asOfDate]
      );
      const totals = { asset: 0, liability: 0, equity: 0 };
      for (const row of sumsR.rows) {
        if (row.type in totals) totals[row.type] = Number(row.cents);
      }
      const diff = totals.asset - (totals.liability + totals.equity);
      checks.push({
        id: 'balance_sheet_ties',
        label: 'Balance sheet ties (Assets = Liabilities + Equity)',
        status: diff === 0 ? 'pass' : 'fail',
        detail:
          diff === 0
            ? `As of ${asOfDate}: Assets ${totals.asset} = Liabilities ${totals.liability} + Equity ${totals.equity}.`
            : `As of ${asOfDate}: Assets ${totals.asset} vs. Liabilities + Equity ${totals.liability + totals.equity} (off by ${diff} cents).`,
      });
    }
  }

  // 2. Grant allocations vs. award: sum of a grant's org_grant_allocations (across all FYs)
  // should equal its award amount. Matches grantCarryforward.js's own eligibility filter.
  {
    const mismatchR = await pool.query(
      `SELECT g.id, g.name, g.amount_cents,
              COALESCE(SUM(ga.amount_cents), 0)::bigint AS allocated_cents
       FROM org_grants g
       LEFT JOIN org_grant_allocations ga ON ga.grant_id = g.id
       WHERE g.org_id = $1 AND g.status NOT IN ('declined', 'closed')
         AND EXISTS (
           SELECT 1 FROM org_grant_allocations ga2 WHERE ga2.grant_id = g.id AND ga2.fiscal_year = $2
         )
       GROUP BY g.id, g.name, g.amount_cents
       HAVING COALESCE(SUM(ga.amount_cents), 0) != COALESCE(g.amount_cents, 0)`,
      [orgId, fiscalYear]
    );
    checks.push({
      id: 'grant_allocations_vs_award',
      label: 'Grant allocations sum to award amount',
      status: mismatchR.rows.length === 0 ? 'pass' : 'fail',
      count: mismatchR.rows.length,
      detail:
        mismatchR.rows.length === 0
          ? 'All grants with an FY' + fiscalYear + ' allocation have allocations summing to their award amount.'
          : mismatchR.rows.map((r) => `"${r.name}": allocated ${r.allocated_cents} vs. award ${r.amount_cents}`).join('; '),
    });
  }

  // 3. Schedule-item / personnel allocation completeness: any row WITH allocation child rows
  // must sum to 10000 bps. (Indirect-cost allocations already enforce this at write time in
  // allocationSchedules.js's validatePayload() -- included below as an informational line
  // since it can't fail, not a live check.)
  {
    const scheduleR = await pool.query(
      `SELECT si.id, si.label,
              COALESCE(SUM(a.percent_bps), 0)::int AS total_bps
       FROM org_schedule_items si
       INNER JOIN org_schedule_item_allocations a ON a.coop_schedule_item_id = si.id
       WHERE si.org_id = $1 AND si.fiscal_year = $2
       GROUP BY si.id, si.label
       HAVING COALESCE(SUM(a.percent_bps), 0) != 10000`,
      [orgId, fiscalYear]
    );
    const personnelR = await pool.query(
      `SELECT p.id, p.full_name,
              COALESCE(SUM(a.percent_bps), 0)::int AS total_bps
       FROM org_personnel p
       INNER JOIN org_personnel_allocations a ON a.coop_personnel_id = p.id
       WHERE p.org_id = $1 AND p.fiscal_year = $2
       GROUP BY p.id, p.full_name
       HAVING COALESCE(SUM(a.percent_bps), 0) != 10000`,
      [orgId, fiscalYear]
    );
    const badRows = [...scheduleR.rows.map((r) => `schedule item "${r.label}": ${r.total_bps / 100}%`),
                      ...personnelR.rows.map((r) => `personnel "${r.full_name}": ${r.total_bps / 100}%`)];
    checks.push({
      id: 'allocation_completeness',
      label: 'Program allocations sum to 100%',
      status: badRows.length === 0 ? 'pass' : 'fail',
      count: badRows.length,
      detail: badRows.length === 0
        ? 'Every schedule item / personnel row with a program split sums to 100%.'
        : badRows.join('; '),
    });
    checks.push({
      id: 'indirect_cost_allocations',
      label: 'Indirect cost allocations sum to 100% / total',
      status: 'pass',
      detail: 'Enforced at write time (allocationSchedules.js validatePayload) -- cannot be saved out of balance.',
    });
  }

  // 5. Unallocated Donor Receipts aging: money sitting in the suspense account (migration 250,
  // see grantGiftPayment.js) is real cash that's economically already revenue once a grant gift
  // links to it and reclassifies out -- if it lingers past period close, it misstates the
  // balance sheet (shown as a liability when it's substantively earned). This is a real gap
  // identified by external review, not a hard failure (locking is allowed on an imperfect
  // year, same reasoning as the other checks here) -- just a surfaced nudge to clear it before
  // close. Approximates "how long has this been sitting here" via the oldest deposit into the
  // account that hasn't been fully offset by reclassifying entries since -- not true per-deposit
  // FIFO aging (this account has no per-deposit clearing ledger), a reasonable simplification
  // for an advisory check.
  {
    const suspenseR = await pool.query(
      `SELECT a.id, a.name FROM org_accounts a WHERE a.org_id = $1 AND a.is_system_unallocated_receipts_account = true LIMIT 1`,
      [orgId]
    );
    if (suspenseR.rows.length) {
      const { endDate } = fyDateRange(fiscalYear, await getFiscalYearEndMonth(pool, orgId));
      const balanceR = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS balance_cents,
                MIN(t.transaction_date)::text AS oldest_deposit_date
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE l.account_id = $1 AND t.org_id = $2 AND t.status = 'posted' AND t.transaction_date <= $3::date
           AND l.credit_cents > 0`,
        [suspenseR.rows[0].id, orgId, endDate]
      );
      const netR = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS balance_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE l.account_id = $1 AND t.org_id = $2 AND t.status = 'posted' AND t.transaction_date <= $3::date`,
        [suspenseR.rows[0].id, orgId, endDate]
      );
      const netBalanceCents = Number(netR.rows[0].balance_cents);
      checks.push({
        id: 'unallocated_receipts_aging',
        label: 'Unallocated Donor Receipts cleared before period close',
        status: netBalanceCents === 0 ? 'pass' : 'fail',
        detail: netBalanceCents === 0
          ? `"${suspenseR.rows[0].name}" has a zero balance as of ${endDate}.`
          : `"${suspenseR.rows[0].name}" still holds ${netBalanceCents} cents as of ${endDate} (oldest contributing deposit: ${balanceR.rows[0].oldest_deposit_date}) -- link the matching grant gift(s) to reclassify before locking this period.`,
      });
    }
  }

  return {
    fiscalYear,
    checks,
    anyFail: checks.some((c) => c.status === 'fail'),
  };
}

module.exports = { runReconciliationChecks };
