'use strict';

const { netAssetsByClass } = require('./restrictedNetAssets');

// Cash split into unrestricted and donor-restricted, from the same restriction tags the financial statements use:
// restricted net assets are restricted income less the expense tagged as released from it, and restricted cash is what
// remains after the restricted assets that are not cash (a pledge receivable, for example).

async function cashByRestriction(pool, orgId) {
  const r = await pool.query(
    `SELECT
       COALESCE(SUM(l.debit_cents - l.credit_cents) FILTER (WHERE a.is_cash_account), 0)::bigint AS cash,
       COALESCE(SUM(l.debit_cents - l.credit_cents) FILTER (WHERE a.type = 'asset' AND NOT a.is_cash_account AND l.donor_restriction_class = 'temporarily_restricted'), 0)::bigint AS temp_noncash,
       COALESCE(SUM(l.debit_cents - l.credit_cents) FILTER (WHERE a.type = 'asset' AND NOT a.is_cash_account AND l.donor_restriction_class = 'permanently_restricted'), 0)::bigint AS perm_noncash
     FROM org_ledger_lines l
     JOIN org_ledger_transactions t ON t.id = l.transaction_id
     JOIN org_accounts a ON a.id = l.account_id
     WHERE t.org_id = $1 AND t.status = 'posted' AND a.is_statistical IS NOT TRUE AND a.is_posting = true`, [orgId]);
  const row = r.rows[0];
  const net = await netAssetsByClass(pool, orgId);
  const cash = Number(row.cash);
  const cap = (n, max) => Math.max(0, Math.min(n, max));
  const perm = cap(net.permanently_restricted - Number(row.perm_noncash), Math.max(0, cash));
  const temp = cap(net.temporarily_restricted - Number(row.temp_noncash), Math.max(0, cash) - perm);
  return {
    unrestricted_cents: String(cash - temp - perm),
    temporarily_restricted_cents: String(temp),
    permanently_restricted_cents: String(perm),
  };
}

module.exports = { cashByRestriction };
