'use strict';
const { resolveProjected } = require('./OrganizationalProjectionResolver');

/** Optional org_settings.org_profile_data keys used for runway (no migration required). */
function runwayFromProfile(profile) {
  if (!profile || typeof profile !== 'object') return { months: null, cash_balance_cents: null };
  const m =
    profile.runway_months != null
      ? Number(profile.runway_months)
      : profile.cash_runway_months != null
        ? Number(profile.cash_runway_months)
        : null;
  const c =
    profile.cash_balance_cents != null
      ? Number(profile.cash_balance_cents)
      : profile.cash_on_hand_cents != null
        ? Number(profile.cash_on_hand_cents)
        : null;
  return {
    months: Number.isFinite(m) && m >= 0 ? m : null,
    cash_balance_cents: Number.isFinite(c) && c >= 0 ? Math.round(c) : null,
  };
}

function reportingScheduleHints(name, schedule, endDateStr) {
  const hints = [];
  if (endDateStr) {
    const end = new Date(String(endDateStr).slice(0, 10));
    if (!Number.isNaN(end.getTime())) {
      const days = Math.ceil((end.getTime() - Date.now()) / (86400 * 1000));
      if (days >= 0 && days <= 120) {
        hints.push({ grant: name, type: 'grant_end', date: endDateStr, days_until: days });
      }
    }
  }
  if (!schedule || typeof schedule !== 'object') return hints;
  if (Array.isArray(schedule.deadlines)) {
    schedule.deadlines.forEach((d) => {
      if (d && typeof d === 'object') {
        const dt = d.date || d.due || d.due_date;
        if (dt) hints.push({ grant: name, type: 'deadline', label: d.label || d.name || 'Report', date: String(dt) });
      }
    });
  }
  if (typeof schedule.next_deadline === 'string') {
    hints.push({ grant: name, type: 'next_deadline', date: schedule.next_deadline });
  }
  if (typeof schedule.notes === 'string' && schedule.notes.trim()) {
    hints.push({ grant: name, type: 'schedule_notes', text: schedule.notes.trim().slice(0, 500) });
  }
  return hints;
}

/**
 * Aggregate metrics for NP executive AI summary (JSON-serializable).
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {number} fiscalYear calendar year used for budget_lines.fiscal_year / actuals.period_year
 */
async function buildOrganizationalFinanceSnapshot(pool, orgId, fiscalYear) {
  const orgR = await pool.query(
    `SELECT o.display_name, s.org_profile_data
     FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id
     WHERE o.id = $1 LIMIT 1`,
    [orgId]
  );
  const orgRow = orgR.rows[0] || {};
  const profile = orgRow.org_profile_data && typeof orgRow.org_profile_data === 'object'
    ? orgRow.org_profile_data
    : {};
  const runway = runwayFromProfile(profile);

  const grantsR = await pool.query(
    `SELECT g.id, g.name, g.funder, g.amount_cents, g.status AS status,
            g.start_date::text AS start_date, g.end_date::text AS end_date, g.reporting_schedule,
            COALESCE(SUM(bl.amount_cents), 0)::bigint AS budgeted_with_grant_cents
     FROM org_grants g
     LEFT JOIN org_budget_lines bl
       ON bl.grant_id = g.id AND bl.org_id = g.org_id AND bl.fiscal_year = $2
     WHERE g.org_id = $1
     GROUP BY g.id
     ORDER BY g.status, g.end_date NULLS LAST, g.id DESC`,
    [orgId, fiscalYear]
  );

  const grants = grantsR.rows.map((g) => {
    const amt = g.amount_cents != null ? Number(g.amount_cents) : null;
    const bud = Number(g.budgeted_with_grant_cents) || 0;
    let utilization_pct = null;
    if (amt != null && amt > 0 && bud >= 0) {
      utilization_pct = Math.round((bud / amt) * 1000) / 10;
    }
    return {
      id: g.id,
      name: g.name,
      funder: g.funder,
      status: g.status,
      amount_cents: amt,
      start_date: g.start_date,
      end_date: g.end_date,
      budgeted_to_grant_fy_cents: bud,
      budget_utilization_vs_award_pct: utilization_pct,
      reporting_schedule: g.reporting_schedule,
    };
  });

  let upcoming_reporting = [];
  grants.forEach((g) => {
    const raw = grantsR.rows.find((r) => r.id === g.id);
    const sch = raw && raw.reporting_schedule;
    upcoming_reporting = upcoming_reporting.concat(
      reportingScheduleHints(g.name || 'Grant', sch, g.end_date)
    );
  });

  const totalsR = await pool.query(
    `WITH budget AS (
       SELECT COALESCE(SUM(bl.amount_cents), 0)::bigint AS b
       FROM org_budget_lines bl
       JOIN org_accounts acc ON acc.id = bl.account_id AND acc.is_statistical = false AND acc.type = 'expense'
       WHERE bl.org_id = $1 AND bl.fiscal_year = $2 AND bl.grant_id IS NULL
         AND bl.month <= CASE WHEN $2::int = EXTRACT(YEAR FROM now())::int THEN EXTRACT(MONTH FROM now())::int ELSE 12 END
     ),
     actual AS (
       SELECT COALESCE(SUM(a.amount_cents), 0)::bigint AS a
       FROM org_actuals a
       JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.is_statistical = false AND acc.type = 'expense'
       WHERE a.org_id = $1 AND a.period_year = $2::smallint AND a.status = 'confirmed'::org_actual_status
         AND a.org_account_id IS NOT NULL AND a.org_program_id IS NOT NULL
         AND a.period_month <= CASE WHEN $2::int = EXTRACT(YEAR FROM now())::int THEN EXTRACT(MONTH FROM now())::int ELSE 12 END
     )
     SELECT (SELECT b FROM budget) AS total_budget_cents, (SELECT a FROM actual) AS total_actual_cents`,
    [orgId, fiscalYear]
  );
  const tb = totalsR.rows[0] || {};
  const totalBudget = Number(tb.total_budget_cents) || 0;
  const totalActual = Number(tb.total_actual_cents) || 0;
  const varianceCents = totalBudget - totalActual;
  let totalProjected = 0;
  try {
    const projMap = await resolveProjected(pool, { orgId: orgId, fiscalYear });
    projMap.forEach((v) => {
      totalProjected += Number(v && v.value_cents) || 0;
    });
  } catch (_) {
    totalProjected = 0;
  }

  const varR = await pool.query(
    `WITH budget AS (
       SELECT bl.account_id, bl.program_id, bl.month, SUM(bl.amount_cents)::bigint AS budget_cents
       FROM org_budget_lines bl
       JOIN org_accounts acc ON acc.id = bl.account_id AND acc.is_statistical = false
       WHERE bl.org_id = $1 AND bl.fiscal_year = $2 AND bl.grant_id IS NULL
       GROUP BY bl.account_id, bl.program_id, bl.month
     ),
     actual AS (
       SELECT a.org_account_id AS account_id, a.org_program_id AS program_id, a.period_month AS month,
              SUM(a.amount_cents)::bigint AS actual_cents
       FROM org_actuals a
       JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.is_statistical = false
       WHERE a.org_id = $1 AND a.period_year = $2::smallint AND a.status = 'confirmed'::org_actual_status
         AND a.org_account_id IS NOT NULL AND a.org_program_id IS NOT NULL
       GROUP BY a.org_account_id, a.org_program_id, a.period_month
     ),
     joined AS (
       SELECT
         COALESCE(b.account_id, a.account_id) AS account_id,
         COALESCE(b.program_id, a.program_id) AS program_id,
         COALESCE(b.month, a.month) AS month,
         COALESCE(b.budget_cents, 0) - COALESCE(a.actual_cents, 0) AS variance_cents,
         ABS(COALESCE(b.budget_cents, 0) - COALESCE(a.actual_cents, 0)) AS abs_var
       FROM budget b
       FULL OUTER JOIN actual a
         ON b.account_id = a.account_id AND b.program_id = a.program_id AND b.month = a.month
       WHERE COALESCE(b.account_id, a.account_id) IS NOT NULL
     )
     SELECT j.variance_cents::text AS variance_cents, j.month, acc.code AS account_code, pr.name AS program_name
     FROM joined j
     LEFT JOIN org_accounts acc ON acc.id = j.account_id
     LEFT JOIN org_programs pr ON pr.id = j.program_id
     ORDER BY j.abs_var DESC NULLS LAST
     LIMIT 5`,
    [orgId, fiscalYear]
  );

  const burnR = await pool.query(
    `SELECT COALESCE(SUM(a.amount_cents), 0)::bigint AS expense_cents
     FROM org_actuals a
     INNER JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.type::text = 'expense'
     WHERE a.org_id = $1 AND a.status = 'confirmed'::org_actual_status
       AND make_date(a.period_year::int, a.period_month::int, 1) >=
           (date_trunc('month', NOW() AT TIME ZONE 'UTC')::date - INTERVAL '3 months')`,
    [orgId]
  );
  const expense3mo = Number(burnR.rows[0]?.expense_cents) || 0;
  const avgMonthlyExpenseCents = Math.round(expense3mo / 3);

  let estimated_runway_months = runway.months;
  if (estimated_runway_months == null && runway.cash_balance_cents != null && avgMonthlyExpenseCents > 0) {
    estimated_runway_months = Math.round((runway.cash_balance_cents / avgMonthlyExpenseCents) * 10) / 10;
  }

  return {
    org_display_name: orgRow.display_name || null,
    fiscal_year: fiscalYear,
    as_of_utc: new Date().toISOString(),
    cash_runway: {
      months_reported: runway.months,
      cash_balance_cents: runway.cash_balance_cents,
      avg_monthly_expense_actuals_cents: avgMonthlyExpenseCents || null,
      estimated_runway_months_from_cash: estimated_runway_months,
    },
    grants,
    budget_vs_actual_unscoped: {
      fiscal_year: fiscalYear,
      total_budget_cents: totalBudget,
      total_actual_cents: totalActual,
      total_projected_cents: totalProjected,
      variance_cents: varianceCents,
    },
    largest_budget_variances: varR.rows.map((r) => ({
      program_name: r.program_name,
      account_code: r.account_code,
      month: r.month,
      variance_cents: Number(r.variance_cents),
    })),
    upcoming_reporting,
  };
}

module.exports = { buildOrganizationalFinanceSnapshot, runwayFromProfile };
