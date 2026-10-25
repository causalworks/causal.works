'use strict';

const { ledgerCashCents } = require('./ledgerCash');
const { loadPostingPlAccounts } = require('./OrganizationalBudgetByProgram');

function enumerateCalendarMonths(startDate, monthsAhead) {
  const out = [];
  for (let i = 0; i < monthsAhead; i++) {
    const d = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
    out.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  return out;
}

function displaySignedCents(accountType, rawCents) {
  const n = Number(rawCents) || 0;
  const t = String(accountType || '').toLowerCase();
  const magnitude = Math.abs(n);
  return t === 'income' ? magnitude : -magnitude;
}

async function buildCashflowGrid(pool, opts) {
  const orgId = Number(opts.orgId);
  const startDate = opts.startDate instanceof Date ? opts.startDate : new Date();
  const monthsAhead = Number.isInteger(opts.monthsAhead) && opts.monthsAhead > 0 ? opts.monthsAhead : 12;
  const months = enumerateCalendarMonths(startDate, monthsAhead);

  const accounts = await loadPostingPlAccounts(pool, orgId);
  const accountIds = accounts.map((a) => a.id);

  const budgetByKey = new Map();
  if (accountIds.length) {
    const fyLabels = [...new Set(months.map((m) => m.year))];
    const budR = await pool.query(
      `SELECT account_id, fiscal_year, month, SUM(amount_cents)::bigint AS amount_cents
       FROM org_budget_lines
       WHERE org_id = $1 AND fiscal_year = ANY($2::int[]) AND account_id = ANY($3::int[])
       GROUP BY account_id, fiscal_year, month`,
      [orgId, fyLabels, accountIds]
    );
    for (const r of budR.rows) {
      budgetByKey.set(`${r.account_id}|${r.fiscal_year}|${r.month}`, Number(r.amount_cents));
    }
  }

  const actualByKey = new Map();
  if (accountIds.length && months.length) {
    const pairParams = months.flatMap((m) => [m.year, m.month]);
    const actR = await pool.query(
      `SELECT org_account_id AS account_id, period_year, period_month, SUM(amount_cents)::bigint AS amount_cents
       FROM org_actuals
       WHERE org_id = $1 AND status = 'confirmed' AND org_account_id = ANY($2::int[])
         AND (period_year, period_month) IN (${months.map((_, i) => `($${i * 2 + 3},$${i * 2 + 4})`).join(',')})
       GROUP BY org_account_id, period_year, period_month`,
      [orgId, accountIds, ...pairParams]
    );
    for (const r of actR.rows) {
      actualByKey.set(`${r.account_id}|${r.period_year}|${r.period_month}`, Number(r.amount_cents));
    }
  }

  const netByMonthIdx = new Array(months.length).fill(0);

  const accountRows = accounts.map((acc) => {
    const cells = months.map((m, idx) => {
      const key = `${acc.id}|${m.year}|${m.month}`;
      const hasActual = actualByKey.has(key);
      const rawCents = hasActual ? actualByKey.get(key) : budgetByKey.get(key) || 0;
      netByMonthIdx[idx] += displaySignedCents(acc.type, rawCents);
      return {
        year: m.year,
        month: m.month,
        amount_cents: Math.abs(Number(rawCents) || 0),
        kind: hasActual ? 'actual' : 'forecast',
      };
    });
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      type: acc.type,
      parent_id: acc.parent_id,
      level: acc.level,
      is_posting: acc.is_posting,
      cells,
    };
  });

  const cashAccR = await pool.query(
    `SELECT id FROM org_accounts WHERE org_id = $1 AND is_cash_account = TRUE`,
    [orgId]
  );
  const cashAccountIds = cashAccR.rows.map((r) => r.id);

  let openingCents = 0;
  let openingAsOfDate = null;
  if (cashAccountIds.length) {
    const windowStartIso = `${months[0].year}-${String(months[0].month).padStart(2, '0')}-01`;
    const srcR = await pool.query('SELECT actuals_source FROM org_settings WHERE org_id = $1', [orgId]);
    const fromLedger = !srcR.rows[0] || srcR.rows[0].actuals_source === 'ledger';
    if (fromLedger) {
      openingCents = await ledgerCashCents(pool, orgId, { before: windowStartIso });
      openingAsOfDate = windowStartIso;
    } else {
    const snapR = await pool.query(
      `SELECT DISTINCT ON (coop_account_id) coop_account_id, balance_cents, as_of_date
       FROM org_balance_sheet_snapshots
       WHERE org_id = $1 AND coop_account_id = ANY($2::int[]) AND as_of_date <= $3
       ORDER BY coop_account_id, as_of_date DESC`,
      [orgId, cashAccountIds, windowStartIso]
    );
    openingCents = snapR.rows.reduce((s, r) => s + Number(r.balance_cents), 0);
    openingAsOfDate = snapR.rows.reduce((latest, r) => (!latest || r.as_of_date > latest ? r.as_of_date : latest), null);
    }
  }

  let runningCents = openingCents;
  const cashRow = months.map((m, idx) => {
    const openingForMonth = runningCents;
    const netChangeCents = netByMonthIdx[idx];
    runningCents += netChangeCents;
    return {
      year: m.year,
      month: m.month,
      opening_cents: openingForMonth,
      net_change_cents: netChangeCents,
      closing_cents: runningCents,
    };
  });

  return {
    months,
    accounts: accountRows,
    cash: {
      opening_cents: openingCents,
      opening_as_of_date: openingAsOfDate,
      cash_account_count: cashAccountIds.length,
      rows: cashRow,
    },
  };
}

module.exports = { buildCashflowGrid };
