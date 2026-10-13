'use strict';

async function suggestGiftForTransaction(pool, { orgId, userId, transactionId }) {
  const t = await pool.query(
    `SELECT id, status, entry_type, transaction_date::text AS transaction_date, constituent_id
       FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`, [transactionId, orgId]);
  const txn = t.rows[0];
  if (!txn) return { created: false, reason: 'entry not found' };
  if (txn.status !== 'posted') return { created: false, reason: 'entry not posted yet' };
  if (txn.entry_type !== 'receive') return { created: false, reason: 'not a Receive entry' };

  const l = await pool.query(
    `SELECT ll.program_id, ll.grant_id, ll.debit_cents, ll.credit_cents
       FROM org_ledger_lines ll JOIN org_accounts a ON a.id = ll.account_id
      WHERE ll.transaction_id = $1 AND a.standard_category = 'REV_CONTRIB' AND ll.credit_cents > 0
      ORDER BY ll.id`, [transactionId]);
  if (!l.rows.length) return { created: false, reason: 'no contribution revenue line' };
  const amount = l.rows.reduce((s, r) => s + Number(r.credit_cents) - Number(r.debit_cents), 0);
  if (!(amount > 0)) return { created: false, reason: 'no positive contribution amount' };
  const grantId = (l.rows.find((r) => r.grant_id != null) || {}).grant_id || null;
  const programId = (l.rows.find((r) => r.program_id != null) || {}).program_id || null;

  const dup = await pool.query('SELECT id FROM org_gifts WHERE org_id = $1 AND ledger_transaction_id = $2 LIMIT 1', [orgId, transactionId]);
  if (dup.rows.length) return { created: false, reason: 'a gift is already linked to this entry', giftId: dup.rows[0].id };

  const ins = await pool.query(
    `INSERT INTO org_gifts
       (org_id, constituent_id, grant_id, gift_type, amount_cents, received_at, recorded_by_user_id,
        posting_status, ledger_transaction_id, program_id, source, review_status)
     VALUES ($1, $2, $3, $4, $5, $6::date, $7, 'posted', $8, $9, 'accounting', 'to_confirm')
     RETURNING id`,
    [orgId, txn.constituent_id, grantId, grantId ? 'grant' : 'donation', amount, txn.transaction_date, userId, transactionId, programId]);
  return { created: true, giftId: ins.rows[0].id };
}

async function voidGiftsForTransaction(pool, { orgId, transactionId }) {
  const a = await pool.query(
    `UPDATE org_gifts
        SET posting_status = 'void',
            review_status = CASE WHEN review_status = 'to_confirm' THEN 'dismissed' ELSE review_status END
      WHERE org_id = $1 AND ledger_transaction_id = $2 AND posting_status = 'posted' AND source = 'accounting'`, [orgId, transactionId]);
  const b = await pool.query(
    `UPDATE org_gifts
        SET ledger_transaction_id = NULL,
            posting_status = CASE WHEN gift_type = 'grant' THEN 'unposted' ELSE 'not_applicable' END
      WHERE org_id = $1 AND ledger_transaction_id = $2 AND posting_status = 'posted' AND source = 'funding'
        AND gift_type IN ('grant', 'donation') AND payment_method IS DISTINCT FROM 'in_kind'`, [orgId, transactionId]);
  const d = await pool.query(
    `UPDATE org_gifts SET posting_status = 'void' WHERE org_id = $1 AND ledger_transaction_id = $2 AND posting_status = 'posted'`, [orgId, transactionId]);
  const c = await pool.query(
    `UPDATE org_gift_pledge_installments SET status = 'expected', ledger_transaction_id = NULL, collected_at = NULL
      WHERE org_id = $1 AND ledger_transaction_id = $2`, [orgId, transactionId]);
  return a.rowCount + b.rowCount + c.rowCount + d.rowCount;
}

async function syncGiftAfterRecode(pool, { orgId, userId, transactionId }) {
  const l = await pool.query(
    `SELECT 1 FROM org_ledger_lines ll JOIN org_accounts a ON a.id = ll.account_id
      WHERE ll.transaction_id = $1 AND a.standard_category = 'REV_CONTRIB' AND ll.credit_cents > 0 LIMIT 1`, [transactionId]);
  if (l.rows.length) return suggestGiftForTransaction(pool, { orgId, userId, transactionId });
  const r = await pool.query(
    `UPDATE org_gifts SET posting_status = 'void', review_status = 'dismissed'
      WHERE org_id = $1 AND ledger_transaction_id = $2 AND source = 'accounting' AND review_status = 'to_confirm' AND posting_status = 'posted'`,
    [orgId, transactionId]);
  return { created: false, dismissed: r.rowCount };
}

module.exports = { suggestGiftForTransaction, voidGiftsForTransaction, syncGiftAfterRecode };
