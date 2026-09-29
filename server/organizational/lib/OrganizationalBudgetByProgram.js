'use strict';

const { resolveProjected } = require('./OrganizationalProjectionResolver');

function ytdCalendarMonthForFiscalYear(fiscalYear) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (fiscalYear < y) return 12;
  if (fiscalYear > y) return 0;
  return m;
}

function displayPlCents(accountType, rawCents) {
  const n = Number(rawCents) || 0;
  const t = String(accountType || '').toLowerCase();
  if (t === 'expense' || t === 'income') return Math.abs(n);
  return n;
}

async function loadPostingPlAccounts(pool, orgId) {
  const accR = await pool.query(
    `WITH RECURSIVE roots AS (
       SELECT id FROM org_accounts
       WHERE org_id = $1 AND code IN ('_H1_REV', '_H1_INC', '_H1_EXP')
     ),
     tr AS (
       SELECT id FROM roots
       UNION ALL
       SELECT a.id FROM org_accounts a
       INNER JOIN tr ON a.parent_id = tr.id
       WHERE a.org_id = $1
     )
     SELECT a.id, a.code, a.name, a.type::text AS type, a.parent_id, a.level, a.is_posting
     FROM org_accounts a
     WHERE a.org_id = $1
       AND a.is_statistical = false
       AND (
         (EXISTS (SELECT 1 FROM roots) AND a.id IN (SELECT id FROM tr))
         OR (NOT EXISTS (SELECT 1 FROM roots) AND a.type IN ('income'::org_account_type, 'expense'::org_account_type))
       )
     ORDER BY lower(a.code) ASC, a.id ASC`,
    [orgId]
  );
  return accR.rows;
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, fiscalYear: number, programIds: number[] | null }} opts
 * @returns {Promise<object>}
 */
async function buildBudgetByProgram(pool, opts) {
  const orgId = Number(opts.orgId);
  const fiscalYear = Number(opts.fiscalYear);
  let requestedIds = opts.programIds;
  if (requestedIds != null && !Array.isArray(requestedIds)) {
    requestedIds = null;
  }

  if (!Number.isInteger(orgId) || orgId < 1) {
    throw new Error('orgId invalid');
  }
  if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
    throw new Error('fiscalYear invalid');
  }

  const currentMonth = ytdCalendarMonthForFiscalYear(fiscalYear);
  const accounts = await loadPostingPlAccounts(pool, orgId);
  const posting = accounts.filter((a) => a.is_posting && (a.type === 'income' || a.type === 'expense'));

  let progRows;
  if (requestedIds && requestedIds.length > 0) {
    const uniq = [...new Set(requestedIds.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0))];
    progRows = (
      await pool.query(
        `SELECT id, code, name FROM org_programs
         WHERE org_id = $1 AND parent_id IS NULL AND active = true AND id = ANY($2::int[])
         ORDER BY code ASC NULLS LAST, lower(name) ASC, id ASC`,
        [orgId, uniq]
      )
    ).rows;
  } else {
    progRows = (
      await pool.query(
        `SELECT id, code, name FROM org_programs
         WHERE org_id = $1 AND parent_id IS NULL AND active = true
         ORDER BY code ASC NULLS LAST, lower(name) ASC, id ASC`,
        [orgId]
      )
    ).rows;
  }

  const programs = progRows.map((p) => ({
    id: Number(p.id),
    code: p.code || null,
    name: p.name || '',
  }));
  const programIdList = programs.map((p) => p.id);
  if (programIdList.length === 0) {
    return {
      fiscal_year: fiscalYear,
      current_month: currentMonth,
      programs: [],
      rows: [],
    };
  }

  const budR = await pool.query(
    `SELECT bl.account_id,
            CASE WHEN pr.parent_id IS NULL THEN pr.id ELSE pr.parent_id END AS rollup_program_id,
            bl.month,
            SUM(bl.amount_cents)::bigint AS raw_cents
     FROM org_budget_lines bl
     INNER JOIN org_accounts acc ON acc.id = bl.account_id AND acc.org_id = bl.org_id
     INNER JOIN org_programs pr ON pr.id = bl.program_id AND pr.org_id = bl.org_id
     WHERE bl.org_id = $1
       AND bl.fiscal_year = $2
       AND acc.is_posting = TRUE
       AND acc.type IN ('income'::org_account_type, 'expense'::org_account_type)
       AND CASE WHEN pr.parent_id IS NULL THEN pr.id ELSE pr.parent_id END = ANY($3::int[])
     GROUP BY bl.account_id, rollup_program_id, bl.month`,
    [orgId, fiscalYear, programIdList]
  );

  const actR = await pool.query(
    `SELECT a.org_account_id AS account_id,
            CASE WHEN pr.parent_id IS NULL THEN pr.id ELSE pr.parent_id END AS rollup_program_id,
            a.period_month AS month,
            SUM(a.amount_cents)::bigint AS raw_cents
     FROM org_actuals a
     INNER JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.org_id = a.org_id
     INNER JOIN org_programs pr ON pr.id = a.org_program_id AND pr.org_id = a.org_id
     WHERE a.org_id = $1
       AND a.period_year = $2
       AND a.status = 'confirmed'::org_actual_status
       AND a.org_account_id IS NOT NULL
       AND a.org_program_id IS NOT NULL
       AND acc.is_posting = TRUE
       AND acc.type IN ('income'::org_account_type, 'expense'::org_account_type)
       AND CASE WHEN pr.parent_id IS NULL THEN pr.id ELSE pr.parent_id END = ANY($3::int[])
     GROUP BY a.org_account_id, rollup_program_id, a.period_month`,
    [orgId, fiscalYear, programIdList]
  );

  const budgetMap = new Map();
  for (const row of budR.rows) {
    const aid = Number(row.account_id);
    const pid = Number(row.rollup_program_id);
    const m = Number(row.month);
    const k = `${aid}|${pid}|${m}`;
    budgetMap.set(k, (budgetMap.get(k) || 0) + (Number(row.raw_cents) || 0));
  }

  const actualMap = new Map();
  for (const row of actR.rows) {
    const aid = Number(row.account_id);
    const pid = Number(row.rollup_program_id);
    const m = Number(row.month);
    const k = `${aid}|${pid}|${m}`;
    actualMap.set(k, (actualMap.get(k) || 0) + (Number(row.raw_cents) || 0));
  }

  const projectionMap = await resolveProjected(pool, {
    orgId: orgId,
    fiscalYear,
    accountIds: posting.map((a) => Number(a.id)),
    programIds: programs.map((p) => Number(p.id)),
  });

  function cellMetrics(accountType, programId, accountId) {
    let budgetFull = 0;
    let actualFull = 0;
    let projectedFull = 0;
    const sourceCount = {
      manual_monthly: 0,
      manual_annual: 0,
      formula: 0,
      formula_error: 0,
      allocation: 0,
      derived: 0,
    };
    let firstAllocationScheduleName = null;
    let firstFormulaError = null;
    for (let m = 1; m <= 12; m += 1) {
      const bk = `${accountId}|${programId}|${m}`;
      const bRaw = budgetMap.get(bk) || 0;
      const aRaw = actualMap.get(bk) || 0;
      const bDisp = displayPlCents(accountType, bRaw);
      const aDisp = displayPlCents(accountType, aRaw);
      budgetFull += bDisp;
      actualFull += aDisp;
      const pk = `${accountId}:${programId}:${m}`;
      const pv = projectionMap.get(pk) || { value_cents: 0, source: 'derived' };
      projectedFull += Number(pv.value_cents) || 0;
      if (sourceCount[pv.source] !== undefined) sourceCount[pv.source] += 1;
      if (!firstAllocationScheduleName && pv.schedule_name) firstAllocationScheduleName = pv.schedule_name;
      if (!firstFormulaError && pv.error) firstFormulaError = String(pv.error);
    }
    let projectedSource = 'derived';
    if (sourceCount.formula_error > 0) projectedSource = 'formula_error';
    else if (sourceCount.manual_monthly > 0) projectedSource = 'manual_monthly';
    else if (sourceCount.formula > 0) projectedSource = 'formula';
    else if (sourceCount.manual_annual > 0) projectedSource = 'manual_annual';
    else if (sourceCount.allocation > 0) projectedSource = 'allocation';
    return {
      budget_cents: Math.round(budgetFull),
      actual_cents: Math.round(actualFull),
      projected_cents: Math.round(projectedFull),
      projected_source: projectedSource,
      projected_source_label:
        projectedSource === 'manual_monthly'
          ? 'Manual (monthly)'
          : projectedSource === 'manual_annual'
            ? 'Manual (annual)'
            : projectedSource === 'allocation'
              ? `Allocation${firstAllocationScheduleName ? ': ' + firstAllocationScheduleName : ''}`
              : projectedSource === 'formula'
                ? 'Formula'
                : projectedSource === 'formula_error'
                  ? 'Formula error'
              : 'Derived from actuals + budget',
      projected_error: projectedSource === 'formula_error' ? firstFormulaError || 'Formula error' : null,
    };
  }

  const incomeRows = posting.filter((a) => a.type === 'income');
  const expenseRows = posting.filter((a) => a.type === 'expense');
  incomeRows.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')) || Number(a.id) - Number(b.id));
  expenseRows.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')) || Number(a.id) - Number(b.id));
  const ordered = incomeRows.concat(expenseRows);

  const rows = [];
  for (const acc of ordered) {
    const t = String(acc.type || '').toLowerCase();
    const byProgram = {};
    let totB = 0;
    let totA = 0;
    let totP = 0;
    for (const p of programs) {
      const m = cellMetrics(t, p.id, acc.id);
      byProgram[String(p.id)] = {
        budget_cents: m.budget_cents,
        actual_cents: m.actual_cents,
        projected_cents: m.projected_cents,
        projected_source: m.projected_source,
        projected_source_label: m.projected_source_label,
        projected_error: m.projected_error,
      };
      totB += m.budget_cents;
      totA += m.actual_cents;
      totP += m.projected_cents;
    }
    if (totB === 0 && totA === 0 && totP === 0) continue;

    const accountTypeLabel = t === 'income' ? 'Income' : 'Expense';
    rows.push({
      account_id: acc.id,
      account_code: acc.code || '',
      account_name: acc.name || '',
      account_type: accountTypeLabel,
      totals: {
        budget_cents: totB,
        actual_cents: totA,
        projected_cents: totP,
        projected_source: 'derived',
      },
      by_program: byProgram,
    });
  }

  return {
    fiscal_year: fiscalYear,
    current_month: currentMonth,
    programs,
    rows,
  };
}

module.exports = { buildBudgetByProgram, loadPostingPlAccounts };
