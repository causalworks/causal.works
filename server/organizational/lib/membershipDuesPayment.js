'use strict';

// Records the cash arrival for a dues payment recorded in Membership (org_membership_payments).
// Extracted the same way recordGrantGiftPayment() was (grantGiftPayment.js), so Bank
// Reconciliation's Match action is the only caller -- one posting path. Mirrors
// recordGrantGiftPayment()'s shape: an already-received cash amount, posted once when matched
// against the real deposit, never fabricated by a standalone "Post" button (membership.js
// itself never calls postLedgerTransaction).

const { postLedgerTransaction } = require('./ledgerPosting');

/**
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, paymentId: number, bankAccountId: number,
 *   paymentDate: string, amountCents: number, reference: string|null }} opts
 */
async function recordMembershipDuesPayment(pool, { orgId, userId, paymentId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query(
    `SELECT p.id, p.posting_status, m.first_name, m.last_name,
            t.name AS tier_name, t.revenue_account_id, t.program_id
     FROM org_membership_payments p
     JOIN org_members m ON m.id = p.member_id
     LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
     WHERE p.id = $1 AND m.org_id = $2 LIMIT 1`,
    [paymentId, orgId]
  );
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Membership payment not found' } };
  const payment = r.rows[0];
  if (payment.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Payment posting_status is ${payment.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }
  if (!payment.revenue_account_id) {
    return { httpStatus: 400, body: { error: 'This member\'s tier has no default revenue account set -- set one before matching.', code: 'no_revenue_account' } };
  }
  if (!payment.program_id) {
    return { httpStatus: 400, body: { error: 'This member\'s tier has no program set -- set one before matching.', code: 'no_program' } };
  }

  const memberName = `${payment.first_name} ${payment.last_name}`.trim();
  const postResult = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: paymentDate,
    memo: `Membership dues: ${memberName}${payment.tier_name ? ' (' + payment.tier_name + ')' : ''}`,
    payee: memberName || null,
    referenceNumber: reference || null,
    lines: [
      { account_id: bankAccountId, program_id: payment.program_id, grant_id: null, debit_cents: amountCents, credit_cents: 0 },
      { account_id: payment.revenue_account_id, program_id: payment.program_id, grant_id: null, debit_cents: 0, credit_cents: amountCents },
    ],
    source: 'bank_reconciliation',
    internalApproval: { approvedBy: userId, sourceRefId: payment.id, sourceRefType: 'org_membership_payments' },
  });
  if (postResult.httpStatus >= 400) return postResult;

  await pool.query(
    `UPDATE org_membership_payments SET posting_status = 'posted', ledger_transaction_id = $1 WHERE id = $2`,
    [postResult.body.id, paymentId]
  );

  return { httpStatus: 200, body: { ledger_transaction_id: postResult.body.id } };
}

module.exports = { recordMembershipDuesPayment };
