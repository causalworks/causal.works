'use strict';

// Statement of Cash Flows (indirect): every balance sheet account and the net assets change are counted once, and the result is tied to the ledger's cash accounts.

const { line, group, amountOf, buildStatement } = require('./statementTree');

async function changeInNetAssets(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND t.source <> 'conversion_balance'
       AND a.type IN ('income', 'expense') AND a.is_posting = true AND a.is_statistical IS NOT TRUE`, [orgId, fy]);
  return Number(r.rows[0].cents);
}

async function yearChanges(pool, orgId, fy, type, sign, where) {
  const r = await pool.query(
    `SELECT a.id AS account_id, a.code, a.name, a.standard_category,
            SUM(l.debit_cents - l.credit_cents)::bigint AS net_debit_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND t.source <> 'conversion_balance'
       AND a.type = $3::org_account_type AND a.is_posting = true AND a.is_statistical IS NOT TRUE ${where}
     GROUP BY a.id, a.code, a.name, a.standard_category
     HAVING SUM(l.debit_cents - l.credit_cents) <> 0
     ORDER BY a.code`, [orgId, fy, type]);
  return r.rows.map((x) => ({ ...x, cash_cents: sign * Number(x.net_debit_cents) }));
}

async function cashBalances(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN t.fiscal_year < $2 OR t.source = 'conversion_balance' THEN l.debit_cents - l.credit_cents ELSE 0 END), 0)::bigint AS beginning_cents,
            COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS ending_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
       AND a.type = 'asset' AND a.is_posting = true AND a.is_cash_account = true`, [orgId, fy]);
  return { beginning: Number(r.rows[0].beginning_cents), ending: Number(r.rows[0].ending_cents) };
}

const IS_ACCUMULATED = `(a.name ILIKE 'accumulated%' OR a.id IN (SELECT accumulated_depreciation_account_id FROM org_fixed_assets WHERE org_id = a.org_id))`;
const FIXED = `AND a.standard_category = 'ASSET_FIXED' AND NOT ${IS_ACCUMULATED}`;
const ACCUM = `AND a.standard_category = 'ASSET_FIXED' AND ${IS_ACCUMULATED}`;
const OTHER_ASSETS = `AND a.is_cash_account = false AND COALESCE(a.standard_category, '') <> 'ASSET_FIXED'`;

async function buildCashFlows(pool, orgId, fy) {
  const change = await changeInNetAssets(pool, orgId, fy);
  const operatingAssets = await yearChanges(pool, orgId, fy, 'asset', -1, OTHER_ASSETS);
  const accumulated = await yearChanges(pool, orgId, fy, 'asset', -1, ACCUM);
  const fixed = await yearChanges(pool, orgId, fy, 'asset', -1, FIXED);
  const liabilities = await yearChanges(pool, orgId, fy, 'liability', -1, '');
  const equity = await yearChanges(pool, orgId, fy, 'equity', -1, '');
  const cash = await cashBalances(pool, orgId, fy);

  const assetLabel = (r) => (r.cash_cents < 0 ? 'Increase' : 'Decrease') + ' in ' + r.name;
  const liabLabel = (r) => (r.cash_cents >= 0 ? 'Increase' : 'Decrease') + ' in ' + r.name;
  const acct = (r, label) => line(label, r.cash_cents, { code: r.code, account_id: r.account_id });

  const operating = group('Cash flows from operating activities', [
    line('Change in net assets', change, { key: 'change' }),
    ...accumulated.map((r) => acct(r, 'Depreciation and amortization (non-cash)')),
    ...operatingAssets.map((r) => acct(r, assetLabel(r))),
    ...liabilities.map((r) => acct(r, liabLabel(r))),
  ], { total: 'Net cash from operating activities', key: 'operating' });

  const investing = group('Cash flows from investing activities',
    fixed.length ? fixed.map((r) => acct(r, r.name)) : [line('No investing activity', 0)],
    { total: 'Net cash from investing activities', key: 'investing' });

  const financing = group('Cash flows from financing activities',
    equity.length ? equity.map((r) => acct(r, r.name)) : [line('No financing activity', 0)],
    { total: 'Net cash from financing activities', key: 'financing' });

  const netChange = amountOf(operating) + amountOf(investing) + amountOf(financing);
  const position = group('Cash and cash equivalents', [
    line('Net change in cash and cash equivalents', netChange, { key: 'net-change' }),
    line('Cash and cash equivalents, beginning of year', cash.beginning, { key: 'begin' }),
  ], { total: 'Cash and cash equivalents, end of year', totalKind: 'grand', key: 'end' });

  const checks = [
    { name: 'Net change in cash equals the change in the ledger cash accounts', left: netChange, right: cash.ending - cash.beginning },
    { name: 'Ending cash equals the ledger cash accounts at year end', left: amountOf(position), right: cash.ending },
  ];
  const { rows, warnings } = buildStatement([operating, investing, financing, position], checks);
  return { rows, warnings, net_change_cents: netChange, beginning_cash_cents: cash.beginning, ending_cash_cents: cash.ending };
}

module.exports = { buildCashFlows };
