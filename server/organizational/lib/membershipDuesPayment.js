'use strict';

const { postLedgerTransaction } = require('./ledgerPosting');

async function recordMembershipDuesPayment(pool, { orgId, userId, paymentId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query(
    `SELECT p.id, p.posting_status, p.kind, p.constituent_id, c.display_name,
            t.name AS tier_name, t.revenue_account_id, t.program_id
     FROM org_membership_payments p
     JOIN org_constituents c ON c.id = p.constituent_id
     JOIN org_membership_terms mt ON mt.id = p.term_id
     LEFT JOIN org_membership_tiers t ON t.id = mt.tier_id
     WHERE p.id = $1 AND p.org_id = $2 LIMIT 1`,
    [paymentId, orgId]
  );
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Membership payment not found' } };
  const payment = r.rows[0];
  if (payment.kind !== 'payment') return { httpStatus: 409, body: { error: 'Only a dues payment can be matched to a deposit.', code: 'not_a_payment' } };
  if (payment.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Payment posting_status is ${payment.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }
  if (!payment.revenue_account_id) {
    return { httpStatus: 400, body: { error: 'This dues member\'s tier has no revenue account. Set one on the tier in Membership before matching.', code: 'no_revenue_account' } };
  }
  if (!payment.program_id) {
    return { httpStatus: 400, body: { error: 'This dues member\'s tier has no program. Set one on the tier in Membership before matching.', code: 'no_program' } };
  }

  const memberName = payment.display_name || '';
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
