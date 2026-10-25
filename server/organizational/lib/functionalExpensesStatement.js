'use strict';

// Statement of Functional Expenses: each expense account split by its allocation, every row cross-footed, and the total tied to the Statement of Activities.

const { line, group, amountOf, buildStatement } = require('./statementTree');
const { expensesByAccount } = require('./statementOfActivities');

const COLUMNS = ['program_services', 'mgmt_general', 'fundraising'];

async function allocations(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT a.id AS account_id, a.code, a.name, SUM(l.debit_cents - l.credit_cents)::bigint AS total_cents,
            COALESCE(MAX(fc.program_services_bps), 0) AS program_services_bps,
            COALESCE(MAX(fc.mgmt_general_bps), 0) AS mgmt_general_bps,
            COALESCE(MAX(fc.fundraising_bps), 0) AS fundraising_bps,
            BOOL_OR(fc.id IS NULL) AS missing_classification
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     LEFT JOIN org_functional_classifications fc ON fc.account_id = a.id AND fc.org_id = t.org_id AND fc.fiscal_year = t.fiscal_year
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND a.type = 'expense' AND a.is_posting = true AND a.is_statistical IS NOT TRUE
     GROUP BY a.id, a.code, a.name
     HAVING SUM(l.debit_cents - l.credit_cents) <> 0
     ORDER BY a.code`, [orgId, fy]);
  return r.rows;
}

function split(total, mgmtBps, fundBps) {
  const mgmt = Math.round(total * mgmtBps / 10000);
  const fund = Math.round(total * fundBps / 10000);
  return { program_services: total - mgmt - fund, mgmt_general: mgmt, fundraising: fund };
}

async function buildFunctionalExpenses(pool, orgId, fy) {
  const accounts = await allocations(pool, orgId, fy);
  const activityTotal = (await expensesByAccount(pool, orgId, fy)).reduce((s, r) => s + Number(r.amount_cents), 0);

  const parts = accounts.map((a) => ({
    a, total: Number(a.total_cents),
    ...split(Number(a.total_cents), Number(a.mgmt_general_bps), Number(a.fundraising_bps)),
  }));

  const tree = (pick) => group('Expenses', parts.map((p) => line(p.a.name, pick(p), { code: p.a.code, account_id: p.a.account_id })), { total: 'Total expenses', totalKind: 'grand', key: 'expenses' });
  const trees = { total: tree((p) => p.total) };
  COLUMNS.forEach((c) => { trees[c] = tree((p) => p[c]); });

  const checks = [
    { name: 'Total expenses equal total expenses on the Statement of Activities', left: amountOf(trees.total), right: activityTotal },
    { name: 'Program services, management and general, and fundraising add up to total expenses', left: COLUMNS.reduce((s, c) => s + amountOf(trees[c]), 0), right: amountOf(trees.total) },
  ];
  const built = { total: buildStatement([trees.total], checks) };
  COLUMNS.forEach((c) => { built[c] = buildStatement([trees[c]], []); });

  const warnings = [...built.total.warnings];
  const unset = accounts.filter((a) => a.missing_classification).length;
  if (unset) warnings.push(`${unset} expense account${unset === 1 ? ' has' : 's have'} no functional allocation and ${unset === 1 ? 'is' : 'are'} shown as program services`);
  accounts.forEach((a) => {
    const bps = Number(a.program_services_bps) + Number(a.mgmt_general_bps) + Number(a.fundraising_bps);
    if (!a.missing_classification && bps !== 10000) warnings.push(`${a.name}: allocation adds to ${(bps / 100).toFixed(2)}%, not 100%`);
  });

  const missingById = new Map(accounts.map((a) => [a.account_id, a.missing_classification]));
  const bpsById = new Map(accounts.map((a) => [a.account_id, {
    program_services_bps: Number(a.program_services_bps), mgmt_general_bps: Number(a.mgmt_general_bps), fundraising_bps: Number(a.fundraising_bps),
  }]));
  const rows = built.total.rows.map((r, i) => {
    const out = { ...r, total_cents: r.amount_cents };
    COLUMNS.forEach((c) => { out[c + '_cents'] = built[c].rows[i].amount_cents; });
    if (r.kind !== 'header') {
      const sum = COLUMNS.reduce((s, c) => s + out[c + '_cents'], 0);
      if (sum !== out.total_cents) throw new Error('Statement of Functional Expenses row does not cross-foot: ' + r.label);
    }
    out.missing_classification = r.account_id ? !!missingById.get(r.account_id) : false;
    const bps = r.account_id ? bpsById.get(r.account_id) : null;
    if (bps) Object.assign(out, bps);
    return out;
  });

  return { rows, warnings };
}

module.exports = { buildFunctionalExpenses, splitAllocation: split };
