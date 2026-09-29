'use strict';

const { runwayFromProfile } = require('./OrganizationalFinanceSnapshot');

function fmtUsd(cents) {
  const n = Number(cents) || 0;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n / 100);
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {number} fiscalYear
 */
async function fetchBoardReportData(pool, orgId, fiscalYear) {
  const orgR = await pool.query(
    `SELECT o.display_name, s.org_profile_data
     FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id
     WHERE o.id = $1 LIMIT 1`,
    [orgId]
  );
  const org = orgR.rows[0] || {};
  const profile = org.org_profile_data && typeof org.org_profile_data === 'object' ? org.org_profile_data : {};
  const runway = runwayFromProfile(profile);

  const revR = await pool.query(
    `SELECT COALESCE(SUM(a.amount_cents), 0)::bigint AS cents
     FROM org_actuals a
     INNER JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.type::text = 'income'
     WHERE a.org_id = $1 AND a.period_year = $2::smallint AND a.status = 'confirmed'::org_actual_status`,
    [orgId, fiscalYear]
  );
  const expR = await pool.query(
    `SELECT COALESCE(SUM(a.amount_cents), 0)::bigint AS cents
     FROM org_actuals a
     INNER JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.type::text = 'expense'
     WHERE a.org_id = $1 AND a.period_year = $2::smallint AND a.status = 'confirmed'::org_actual_status`,
    [orgId, fiscalYear]
  );

  const grantsR = await pool.query(
    `SELECT g.id, g.name, g.funder, g.amount_cents, g.status AS status,
            g.start_date::text AS start_date, g.end_date::text AS end_date
     FROM org_grants g
     WHERE g.org_id = $1
     ORDER BY g.status, g.end_date NULLS LAST, g.id DESC`,
    [orgId]
  );

  const activeGrantsR = await pool.query(
    `SELECT COUNT(*)::int AS n FROM org_grants
     WHERE org_id = $1
       AND status = 'awarded'
       AND (end_date IS NULL OR end_date >= CURRENT_DATE)`,
    [orgId]
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
  let runwayLabel = '—';
  if (runway.months != null) {
    runwayLabel = `${runway.months} mo`;
  } else if (runway.cash_balance_cents != null && avgMonthlyExpenseCents > 0) {
    const est = Math.round((runway.cash_balance_cents / avgMonthlyExpenseCents) * 10) / 10;
    runwayLabel = `~${est} mo`;
  }

  const bvaR = await pool.query(
    `WITH budget AS (
       SELECT bl.program_id, SUM(bl.amount_cents)::bigint AS budget_cents
       FROM org_budget_lines bl
       JOIN org_accounts acc ON acc.id = bl.account_id AND acc.is_statistical = false
       WHERE bl.org_id = $1 AND bl.fiscal_year = $2 AND bl.grant_id IS NULL
       GROUP BY bl.program_id
     ),
     actual AS (
       SELECT a.org_program_id AS program_id, SUM(a.amount_cents)::bigint AS actual_cents
       FROM org_actuals a
       JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.is_statistical = false
       WHERE a.org_id = $1 AND a.period_year = $2::smallint AND a.status = 'confirmed'::org_actual_status
         AND a.org_account_id IS NOT NULL AND a.org_program_id IS NOT NULL
       GROUP BY a.org_program_id
     )
     SELECT
       COALESCE(b.program_id, a.program_id) AS program_id,
       pr.name AS program_name,
       COALESCE(b.budget_cents, 0)::text AS budget_cents,
       COALESCE(a.actual_cents, 0)::text AS actual_cents,
       (COALESCE(b.budget_cents, 0) - COALESCE(a.actual_cents, 0))::text AS variance_cents
     FROM budget b
     FULL OUTER JOIN actual a ON b.program_id = a.program_id
     LEFT JOIN org_programs pr ON pr.id = COALESCE(b.program_id, a.program_id)
     WHERE COALESCE(b.program_id, a.program_id) IS NOT NULL
     ORDER BY pr.name NULLS LAST`,
    [orgId, fiscalYear]
  );

  return {
    orgName: org.display_name || 'Organization',
    fiscalYear,
    generatedAt: new Date().toISOString(),
    metrics: {
      revenue_cents: Number(revR.rows[0]?.cents) || 0,
      expenses_cents: Number(expR.rows[0]?.cents) || 0,
      active_grants: activeGrantsR.rows[0]?.n ?? 0,
      runway_label: runwayLabel,
    },
    grants: grantsR.rows.map((g) => ({
      id: g.id,
      name: g.name,
      funder: g.funder,
      amount_cents: g.amount_cents != null ? Number(g.amount_cents) : null,
      status: g.status,
      start_date: g.start_date,
      end_date: g.end_date,
    })),
    budgetVsActualByProgram: bvaR.rows.map((r) => ({
      program_name: r.program_name || '—',
      budget_cents: Number(r.budget_cents) || 0,
      actual_cents: Number(r.actual_cents) || 0,
      variance_cents: Number(r.variance_cents) || 0,
    })),
    fmtUsd,
  };
}

/**
 * @param {import('pg').Pool} pool
 * @param {number} orgId
 * @param {number} grantId
 * @param {number} fiscalYear
 */
async function fetchGrantReportData(pool, orgId, grantId, fiscalYear) {
  const gR = await pool.query(
    `SELECT g.id, g.name, g.funder, g.amount_cents, g.status AS status,
            g.start_date::text AS start_date, g.end_date::text AS end_date,
            g.restrictions, g.reporting_schedule, g.notes
     FROM org_grants g
     WHERE g.id = $1 AND g.org_id = $2
     LIMIT 1`,
    [grantId, orgId]
  );
  if (gR.rows.length === 0) return null;

  const g = gR.rows[0];
  const orgR = await pool.query(`SELECT display_name FROM coop_members WHERE id = $1`, [orgId]);
  const orgName = orgR.rows[0]?.display_name || 'Organization';

  const budR = await pool.query(
    `SELECT COALESCE(SUM(bl.amount_cents), 0)::bigint AS cents
     FROM org_budget_lines bl
     JOIN org_accounts acc ON acc.id = bl.account_id AND acc.is_statistical = false
     WHERE bl.org_id = $1 AND bl.grant_id = $2 AND bl.fiscal_year = $3`,
    [orgId, grantId, fiscalYear]
  );
  const budgetedCents = Number(budR.rows[0]?.cents) || 0;
  const awardCents = g.amount_cents != null ? Number(g.amount_cents) : null;

  return {
    orgName,
    fiscalYear,
    grant: {
      id: g.id,
      name: g.name,
      funder: g.funder,
      amount_cents: awardCents,
      status: g.status,
      start_date: g.start_date,
      end_date: g.end_date,
      restrictions: g.restrictions,
      reporting_schedule: g.reporting_schedule,
      notes: g.notes,
    },
    budgeted_to_grant_fy_cents: budgetedCents,
    utilization_pct:
      awardCents != null && awardCents > 0
        ? Math.round((budgetedCents / awardCents) * 1000) / 10
        : null,
    fmtUsd,
  };
}

function fallbackGrantNarrative(data) {
  const g = data.grant;
  const amt = data.fmtUsd(g.amount_cents != null ? g.amount_cents : 0);
  const bud = data.fmtUsd(data.budgeted_to_grant_fy_cents);
  const period = [g.start_date || '—', g.end_date || '—'].join(' → ');
  return `${g.name} (${g.funder || 'funder TBD'}) is ${g.status || 'unknown'} with an award of ${amt} for the period ${period}. For fiscal year ${data.fiscalYear}, budget lines tagged to this grant total ${bud}.`;
}

module.exports = { fetchBoardReportData, fetchGrantReportData, fallbackGrantNarrative, fmtUsd };
