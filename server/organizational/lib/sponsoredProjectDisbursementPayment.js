'use strict';

// Records the actual cash-out for an approved sponsored-project disbursement
// (org_sponsored_project_disbursements). Approval (status: pending_approval -> approved,
// migration 230) is an internal authorization, not a cash event -- posting only happens here,
// when Bank Reconciliation's Match action confirms it against the real outgoing bank line.
// Mirrors recordBillPayment()'s debit-side shape (billInvoicePayments.js), but simpler: a
// disbursement doesn't go through Bills' two-step AP-liability-then-clear posting (no separate
// obligation is booked at approval time) -- this posts one entry, straight to the project's
// expense account, only once real cash actually moves. Disclosed simplification: admin_fee_cents
// is not posted here (a separate revenue-recognition question, out of scope for this fix).

const { postLedgerTransaction } = require('./ledgerPosting');

/**
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, disbursementId: number, bankAccountId: number,
 *   paymentDate: string, amountCents: number, reference: string|null }} opts
 */
async function recordSponsoredProjectDisbursementPayment(pool, { orgId, userId, disbursementId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query(
    `SELECT d.id, d.status, d.amount_cents, d.ledger_transaction_id, sp.name AS project_name,
            sp.program_id, sp.disbursement_expense_account_id
     FROM org_sponsored_project_disbursements d
     JOIN org_sponsored_projects sp ON sp.id = d.sponsored_project_id
     WHERE d.id = $1 AND d.org_id = $2 LIMIT 1`,
    [disbursementId, orgId]
  );
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Disbursement not found' } };
  const disb = r.rows[0];
  if (disb.status !== 'approved') {
    return { httpStatus: 409, body: { error: `Disbursement status is ${disb.status}, expected approved`, code: 'not_approved' } };
  }
  if (disb.ledger_transaction_id) {
    return { httpStatus: 409, body: { error: 'This disbursement is already posted', code: 'already_posted' } };
  }
  if (!disb.disbursement_expense_account_id) {
    return { httpStatus: 400, body: { error: 'This sponsored project has no default disbursement expense account set -- set one before matching.', code: 'no_expense_account' } };
  }
  if (!disb.program_id) {
    return { httpStatus: 400, body: { error: 'This sponsored project has no program set -- set one before matching.', code: 'no_program' } };
  }
  if (amountCents !== Number(disb.amount_cents)) {
    return { httpStatus: 422, body: { error: `amount_cents (${amountCents}) must match the disbursement amount (${disb.amount_cents})`, code: 'amount_mismatch' } };
  }

  const postResult = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: paymentDate,
    memo: `Sponsored project disbursement: ${disb.project_name}`,
    payee: null,
    referenceNumber: reference || null,
    lines: [
      { account_id: disb.disbursement_expense_account_id, program_id: disb.program_id, grant_id: null, debit_cents: amountCents, credit_cents: 0 },
      { account_id: bankAccountId, program_id: disb.program_id, grant_id: null, debit_cents: 0, credit_cents: amountCents },
    ],
    source: 'bank_reconciliation',
    internalApproval: { approvedBy: userId, sourceRefId: disb.id, sourceRefType: 'org_sponsored_project_disbursements' },
  });
  if (postResult.httpStatus >= 400) return postResult;

  await pool.query(
    `UPDATE org_sponsored_project_disbursements SET ledger_transaction_id = $1 WHERE id = $2`,
    [postResult.body.id, disbursementId]
  );

  return { httpStatus: 200, body: { ledger_transaction_id: postResult.body.id } };
}

module.exports = { recordSponsoredProjectDisbursementPayment };
