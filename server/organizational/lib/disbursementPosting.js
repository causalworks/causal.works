'use strict';

const { postLedgerTransaction, voidLedgerTransaction, DATE_RE } = require('./ledgerPosting');

async function postDisbursement(pool, { orgId, userId, disbursementId, postingDate, expenseAccountId, bankAccountId, programId }) {
  if (!postingDate || !DATE_RE.test(postingDate)) return { httpStatus: 400, body: { error: 'posting_date is required and must be YYYY-MM-DD' } };
  const r = await pool.query(
    `SELECT d.*, p.name AS project_name, p.program_id AS project_program_id, p.disbursement_expense_account_id
       FROM org_sponsored_project_disbursements d JOIN org_sponsored_projects p ON p.id = d.sponsored_project_id
      WHERE d.id = $1 AND d.org_id = $2`, [disbursementId, orgId]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Disbursement not found' } };
  const d = r.rows[0];
  if (d.status !== 'approved') return { httpStatus: 409, body: { error: 'Only an approved disbursement can be posted.', code: 'not_approved' } };
  if (d.ledger_transaction_id) return { httpStatus: 409, body: { error: 'This disbursement is already posted.', code: 'already_posted' } };
  const expense = expenseAccountId || d.disbursement_expense_account_id;
  const program = programId || d.project_program_id;
  if (!expense || !bankAccountId || !program) {
    return { httpStatus: 400, body: { error: 'An expense account, a bank account and a program are all needed to post a disbursement.' } };
  }
  const amount = Number(d.amount_cents);
  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: postingDate,
    memo: 'Disbursement to ' + d.project_name + (d.notes ? ': ' + d.notes : ''),
    payee: null, referenceNumber: null,
    lines: [
      { account_id: expense, program_id: program, debit_cents: amount, credit_cents: 0 },
      { account_id: bankAccountId, program_id: program, debit_cents: 0, credit_cents: amount },
    ],
    source: 'sponsored_disbursement',
    internalApproval: { approvedBy: userId, sourceRefId: disbursementId, sourceRefType: 'org_sponsored_project_disbursements' },
  });
  if (result.httpStatus >= 400) return result;
  await pool.query('UPDATE org_sponsored_project_disbursements SET ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3', [result.body.id, disbursementId, orgId]);
  return { httpStatus: 200, body: { id: disbursementId, ledger_transaction_id: result.body.id } };
}

async function unpostDisbursement(pool, { orgId, userId, disbursementId, reason }) {
  if (!reason) return { httpStatus: 400, body: { error: 'A reason is required.' } };
  const r = await pool.query('SELECT ledger_transaction_id FROM org_sponsored_project_disbursements WHERE id = $1 AND org_id = $2', [disbursementId, orgId]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Disbursement not found' } };
  if (!r.rows[0].ledger_transaction_id) return { httpStatus: 409, body: { error: 'This disbursement is not posted.', code: 'not_posted' } };
  const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: r.rows[0].ledger_transaction_id, voidReason: reason });
  if (v.httpStatus >= 400) return v;
  await pool.query('UPDATE org_sponsored_project_disbursements SET ledger_transaction_id = NULL WHERE id = $1 AND org_id = $2', [disbursementId, orgId]);
  return { httpStatus: 200, body: { id: disbursementId, unposted: true } };
}

module.exports = { postDisbursement, unpostDisbursement };
