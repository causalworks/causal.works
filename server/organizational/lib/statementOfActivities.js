'use strict';

// Statement of Activities: two parallel trees (without and with donor restrictions) built from the ledger, combined into one row set, and tied to the ledger's ending net assets.

const { netAssetsByClass, netAssetBuckets, releasedFromRestrictions } = require('./restrictedNetAssets');
const { line, group, amountOf, buildStatement } = require('./statementTree');

const BUCKET = `CASE WHEN l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted') THEN 'with_restrictions' ELSE 'without_restrictions' END`;

async function revenueByAccount(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT a.id AS account_id, a.code, a.name, ${BUCKET} AS bucket, SUM(l.credit_cents - l.debit_cents)::bigint AS amount_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND a.type = 'income' AND a.is_posting = true AND a.is_statistical IS NOT TRUE
     GROUP BY a.id, a.code, a.name, 4
     HAVING SUM(l.credit_cents - l.debit_cents) <> 0
     ORDER BY a.code`, [orgId, fy]);
  return r.rows;
}

async function expensesByAccount(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT a.id AS account_id, a.code, a.name, SUM(l.debit_cents - l.credit_cents)::bigint AS amount_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND a.type = 'expense' AND a.is_posting = true AND a.is_statistical IS NOT TRUE
     GROUP BY a.id, a.code, a.name
     HAVING SUM(l.debit_cents - l.credit_cents) <> 0
     ORDER BY a.code`, [orgId, fy]);
  return r.rows;
}

async function directEquityEntries(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT ${BUCKET} AS bucket, SUM(l.credit_cents - l.debit_cents)::bigint AS amount_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND a.type = 'equity' AND a.is_posting = true AND a.is_statistical IS NOT TRUE
     GROUP BY 1`, [orgId, fy]);
  const out = { without_restrictions: 0, with_restrictions: 0 };
  r.rows.forEach((x) => { out[x.bucket] = Number(x.amount_cents); });
  return out;
}

function columnRoots(col, d) {
  const isWithout = col === 'without_restrictions';
  const revenue = group('Revenue', d.revenueAccounts.map((a) => line(a.name, d.revenueCents(a.account_id, col), { code: a.code, account_id: a.account_id })), { total: 'Total revenue', key: 'revenue' });
  const released = line('Net assets released from restrictions', isWithout ? d.released : -d.released, { key: 'released' });
  const expenses = group('Expenses', d.expenseAccounts.map((a) => line(a.name, isWithout ? Number(a.amount_cents) : 0, { code: a.code, account_id: a.account_id })), { total: 'Total expenses', key: 'expenses' });
  const change = amountOf(revenue) + released.cents - amountOf(expenses);
  const other = d.other[col];
  const begin = d.begin[col];
  const netAssets = group('Net assets', [
    line('Change in net assets from activities', change, { key: 'change' }),
    line('Opening balances and other direct entries to net assets', other, { key: 'other' }),
    line('Net assets, beginning of year', begin, { key: 'begin' }),
  ], { total: 'Net assets, end of year', totalKind: 'grand', key: 'end' });
  return { roots: [revenue, released, expenses, netAssets], change, endNode: netAssets };
}

async function buildStatementOfActivities(pool, orgId, fy) {
  const revenue = await revenueByAccount(pool, orgId, fy);
  const expenses = await expensesByAccount(pool, orgId, fy);
  const released = await releasedFromRestrictions(pool, orgId, fy);
  const other = await directEquityEntries(pool, orgId, fy);
  const begin = netAssetBuckets(await netAssetsByClass(pool, orgId, { beforeFiscalYear: fy }));
  const end = netAssetBuckets(await netAssetsByClass(pool, orgId, { throughFiscalYear: fy }));

  const accounts = new Map();
  revenue.forEach((r) => { if (!accounts.has(r.account_id)) accounts.set(r.account_id, { account_id: r.account_id, code: r.code, name: r.name }); });
  const cell = new Map(revenue.map((r) => [r.account_id + ':' + r.bucket, Number(r.amount_cents)]));
  const d = {
    revenueAccounts: [...accounts.values()],
    revenueCents: (id, col) => cell.get(id + ':' + col) || 0,
    expenseAccounts: expenses,
    released, other, begin,
  };

  const built = {};
  for (const col of ['without_restrictions', 'with_restrictions']) {
    const c = columnRoots(col, d);
    const checks = [
      { name: `Ending net assets (${col.replace('_', ' ')}) equal the ledger's net assets at year end`, left: amountOf(c.endNode), right: end[col] },
    ];
    built[col] = { ...buildStatement(c.roots, checks), change: c.change };
  }

  const w = built.without_restrictions;
  const v = built.with_restrictions;
  const rows = w.rows.map((r, i) => {
    const o = v.rows[i];
    if (o.kind !== r.kind || o.label !== r.label) throw new Error('Statement of Activities columns did not line up at row ' + i);
    const wo = r.amount_cents;
    const wi = o.amount_cents;
    return { ...r, without_cents: wo, with_cents: wi, amount_cents: wo == null ? null : wo + wi };
  });

  return {
    rows,
    warnings: [...w.warnings, ...v.warnings],
    totals: {
      revenue_without_restrictions_cents: rows.find((r) => r.key === 'revenue' && r.kind === 'subtotal').without_cents,
      revenue_with_restrictions_cents: rows.find((r) => r.key === 'revenue' && r.kind === 'subtotal').with_cents,
      total_expenses_cents: rows.find((r) => r.key === 'expenses' && r.kind === 'subtotal').without_cents,
      released_from_restrictions_cents: released,
      change_without_restrictions_cents: w.change,
      change_with_restrictions_cents: v.change,
      total_change_in_net_assets_cents: w.change + v.change,
    },
    net_assets: {
      beginning: { without_restrictions_cents: begin.without_restrictions, with_restrictions_cents: begin.with_restrictions, total_cents: begin.without_restrictions + begin.with_restrictions },
      ending: { without_restrictions_cents: end.without_restrictions, with_restrictions_cents: end.with_restrictions, total_cents: end.without_restrictions + end.with_restrictions },
    },
  };
}

module.exports = { buildStatementOfActivities, expensesByAccount };
