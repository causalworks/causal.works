'use strict';

// Reads used by the conversion balances screen and the action that saves them.

function excludedReason(a) {
  if (a.is_system_ar_account) return 'Enter outstanding invoices dated before the conversion date.';
  if (a.is_system_ap_account) return 'Enter unpaid bills dated before the conversion date.';
  if (a.is_system_expense_claims_payable_account) return 'Comes from expense claims.';
  if (a.is_system_unallocated_receipts_account || a.is_system_clearing_account) return 'Used by Accounting to hold items in transit.';
  return null;
}

async function loadAccounts(pool, orgId) {
  const r = await pool.query(
    `SELECT id, code, name, type::text AS type, standard_category, is_cash_account, is_system_ar_account, is_system_ap_account, is_system_clearing_account,
            is_system_expense_claims_payable_account, is_system_unallocated_receipts_account
       FROM org_accounts
      WHERE org_id = $1 AND is_posting AND NOT is_statistical AND type IN ('asset', 'liability', 'equity') AND archived_at IS NULL
      ORDER BY type, code NULLS LAST, name`, [orgId]);
  return r.rows.map((a) => ({ ...a, excluded_reason: excludedReason(a) }));
}

async function currentRow(pool, orgId) {
  return (await pool.query('SELECT * FROM org_conversion_balances WHERE org_id = $1', [orgId])).rows[0] || null;
}

const BALANCING_MEMO = 'Balancing amount';

module.exports = { loadAccounts, currentRow, BALANCING_MEMO };
