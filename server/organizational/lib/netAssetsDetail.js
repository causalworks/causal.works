'use strict';

// Entries behind a net assets amount on the statements, tied to the amount the statement prints for the same selection.

const { netAssetsByClass, netAssetBuckets } = require('./restrictedNetAssets');
const { designationBalances } = require('./financialPositionStatement');

const LINE_CAP = 5000;

// bucket: 'without' | 'with'; designation: 'all' | 'none' | a designation id
async function netAssetsDetail(pool, orgId, fy, bucket, designation) {
  const params = [orgId, fy];
  let where = `t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
    AND a.type IN ('income', 'expense', 'equity') AND a.is_posting = true AND a.is_statistical IS NOT TRUE`;

  let expected;
  if (/^\d+$/.test(String(designation))) {
    params.push(Number(designation));
    where += ` AND l.board_designation_id = $${params.length}`;
    const mine = (await designationBalances(pool, orgId, fy)).find((d) => d.id === Number(designation));
    expected = mine ? Number(mine.balance_cents) : 0;
  } else {
    where += bucket === 'with'
      ? ` AND l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')`
      : ` AND (l.donor_restriction_class IS NULL OR l.donor_restriction_class = 'unrestricted')`;
    const buckets = netAssetBuckets(await netAssetsByClass(pool, orgId, { throughFiscalYear: fy }));
    const designated = (await designationBalances(pool, orgId, fy)).reduce((s, d) => s + Number(d.balance_cents), 0);
    if (bucket === 'with') expected = buckets.with_restrictions;
    else if (designation === 'none') { where += ' AND l.board_designation_id IS NULL'; expected = buckets.without_restrictions - designated; }
    else expected = buckets.without_restrictions;
  }

  const totalR = await pool.query(
    `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents, COUNT(*)::int AS n
     FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id JOIN org_accounts a ON a.id = l.account_id
     WHERE ${where}`, params);
  const total = Number(totalR.rows[0].cents);

  const linesR = await pool.query(
    `SELECT l.id, t.id AS transaction_id, t.transaction_date, t.memo, a.id AS account_id, a.code, a.name AS account_name, a.type::text AS account_type,
            COALESCE(l.donor_restriction_class::text, 'unrestricted') AS restriction_class,
            (l.credit_cents - l.debit_cents)::bigint AS amount_cents
     FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id JOIN org_accounts a ON a.id = l.account_id
     WHERE ${where}
     ORDER BY t.transaction_date, t.id, l.id
     LIMIT ${LINE_CAP}`, params);

  return {
    lines: linesR.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) })),
    line_count: totalR.rows[0].n,
    truncated: totalR.rows[0].n > LINE_CAP,
    total_cents: total,
    expected_cents: expected,
    ties: total === expected,
  };
}

module.exports = { netAssetsDetail };
