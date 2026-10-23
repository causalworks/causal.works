'use strict';

// Net assets by donor restriction and the amount released from restrictions, shared by the financial statements and the cash split.

const RESTRICTED = ['temporarily_restricted', 'permanently_restricted'];

async function netAssetsByClass(pool, orgId, { throughFiscalYear = null, beforeFiscalYear = null } = {}) {
  const r = await pool.query(
    `SELECT COALESCE(l.donor_restriction_class::text, 'unrestricted') AS restriction_class,
            SUM(l.credit_cents - l.debit_cents)::bigint AS net_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted'
       AND a.type IN ('income', 'expense', 'equity') AND a.is_posting = true AND a.is_statistical IS NOT TRUE
       AND ($2::int IS NULL OR t.fiscal_year <= $2)
       AND ($3::int IS NULL OR t.fiscal_year < $3)
     GROUP BY 1`, [orgId, throughFiscalYear, beforeFiscalYear]);
  const out = { unrestricted: 0, temporarily_restricted: 0, permanently_restricted: 0 };
  for (const row of r.rows) out[row.restriction_class] = Number(row.net_cents);
  return out;
}

function netAssetBuckets(byClass) {
  return {
    without_restrictions: byClass.unrestricted,
    with_restrictions: byClass.temporarily_restricted + byClass.permanently_restricted,
  };
}

async function releasedFromRestrictions(pool, orgId, fiscalYear) {
  const r = await pool.query(
    `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS released_cents
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
       AND a.type = 'expense' AND a.is_posting = true AND a.is_statistical IS NOT TRUE
       AND l.donor_restriction_class = ANY($3::org_restriction_class[])`, [orgId, fiscalYear, RESTRICTED]);
  return Number(r.rows[0].released_cents);
}

module.exports = { RESTRICTED, netAssetsByClass, netAssetBuckets, releasedFromRestrictions };
