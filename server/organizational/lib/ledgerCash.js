'use strict';
// Cash on hand from the ledger: the posted balance of the cash accounts.

async function ledgerCashCents(pool, orgId, { before, through } = {}) {
  const dateSql = before ? 't.transaction_date < $2::date' : 't.transaction_date <= $2::date';
  const r = await pool.query(
    `SELECT COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS cents
       FROM org_ledger_lines l
       JOIN org_ledger_transactions t ON t.id = l.transaction_id AND t.status = 'posted' AND ${dateSql}
       JOIN org_accounts a ON a.id = l.account_id AND a.is_cash_account
      WHERE t.org_id = $1`, [orgId, before || through || new Date().toISOString().slice(0, 10)]);
  return Number(r.rows[0].cents);
}

module.exports = { ledgerCashCents };
