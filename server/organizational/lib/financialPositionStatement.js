'use strict';

// Statement of Financial Position: one tree built from the ledger, checked before it is returned.

const { netAssetsByClass, netAssetBuckets } = require('./restrictedNetAssets');
const { line, group, amountOf, buildStatement } = require('./statementTree');

async function balancesByType(pool, orgId, fy, type) {
  const sign = type === 'asset' ? 'l.debit_cents - l.credit_cents' : 'l.credit_cents - l.debit_cents';
  const r = await pool.query(
    `SELECT a.id AS account_id, a.code, a.name, a.type, SUM(${sign})::bigint AS balance_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
       AND a.type = $3::org_account_type AND a.is_posting = true
     GROUP BY a.id, a.code, a.name, a.type
     HAVING SUM(${sign}) <> 0
     ORDER BY a.code`, [orgId, fy, type]);
  return r.rows;
}

async function designationBalances(pool, orgId, fy) {
  const r = await pool.query(
    `SELECT d.id, d.name, SUM(l.credit_cents - l.debit_cents)::bigint AS balance_cents
     FROM org_board_designations d
     JOIN org_ledger_lines l ON l.board_designation_id = d.id
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     WHERE d.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
     GROUP BY d.id, d.name
     HAVING SUM(l.credit_cents - l.debit_cents) <> 0
     ORDER BY d.name`, [orgId, fy]);
  return r.rows;
}

async function buildFinancialPosition(pool, orgId, fy) {
  const assets = await balancesByType(pool, orgId, fy, 'asset');
  const liabilities = await balancesByType(pool, orgId, fy, 'liability');
  const byClass = await netAssetsByClass(pool, orgId, { throughFiscalYear: fy });
  const buckets = netAssetBuckets(byClass);
  const designations = await designationBalances(pool, orgId, fy);

  const acct = (r) => line(r.name, r.balance_cents, { code: r.code, account_id: r.account_id });
  const designatedTotal = designations.reduce((s, d) => s + Number(d.balance_cents), 0);

  const withoutLines = designations.map((d) => line('Designated by the board: ' + d.name, d.balance_cents, { key: 'designated-' + d.id }));
  withoutLines.push(line('Undesignated', buckets.without_restrictions - designatedTotal, { key: 'undesignated' }));

  const assetsNode = group('Assets', assets.map(acct), { total: 'Total assets', totalKind: 'total', key: 'assets' });
  const liabilitiesNode = group('Liabilities', liabilities.map(acct), { total: 'Total liabilities', totalKind: 'total', key: 'liabilities' });
  const withoutNode = group('Without donor restrictions', withoutLines, { total: 'Net assets without donor restrictions', key: 'without' });
  const netAssetsNode = group('Net assets', [withoutNode, line('With donor restrictions', buckets.with_restrictions, { key: 'with' })], { total: 'Total net assets', totalKind: 'total', key: 'net-assets' });

  const totalAssets = amountOf(assetsNode);
  const totalLiabilities = amountOf(liabilitiesNode);
  const totalNetAssets = amountOf(netAssetsNode);

  const checks = [
    { name: 'Total assets equal total liabilities plus total net assets', left: totalAssets, right: totalLiabilities + totalNetAssets },
    { name: 'Net assets without donor restrictions equal the ledger total for that class', left: amountOf(withoutNode), right: buckets.without_restrictions },
    { name: 'Total net assets equal the ledger total for both classes', left: totalNetAssets, right: buckets.without_restrictions + buckets.with_restrictions },
    { name: 'Board designations exceed net assets without donor restrictions', severity: 'warn', left: Math.max(designatedTotal - buckets.without_restrictions, 0), right: 0 },
  ];

  const { rows, warnings } = buildStatement([assetsNode, liabilitiesNode, netAssetsNode], checks);
  rows.push({ kind: 'grand', label: 'Total liabilities and net assets', amount_cents: totalLiabilities + totalNetAssets, indent: 0, key: 'grand' });

  return {
    rows, warnings,
    assets, liabilities,
    totals: { assets: totalAssets, liabilities: totalLiabilities, net_assets: totalNetAssets, liabilities_and_net_assets: totalLiabilities + totalNetAssets },
    net_assets: { without_restrictions: buckets.without_restrictions, with_restrictions: buckets.with_restrictions, board_designated: designatedTotal, undesignated: buckets.without_restrictions - designatedTotal },
    restriction_detail: { temporarily_restricted: byClass.temporarily_restricted || 0, permanently_restricted: byClass.permanently_restricted || 0 },
  };
}

module.exports = { buildFinancialPosition, designationBalances };
