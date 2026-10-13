'use strict';

// Receiving money against a booked pledge installment: the entry debits the bank and credits the pledge's receivable account,
// and the installment is marked collected. Shared by Receive and Banking.

const { postLedgerTransaction } = require('./ledgerPosting');
const { loadExpected } = require('./giftMatch');

function pledgeReceiptLines(applied, bankAccountId) {
  if (!applied.program_id) {
    return { error: 'This pledge has no program, so its receipt cannot be posted. Add the program to the pledge first.' };
  }
  const amount = Number(applied.amount_cents);
  return {
    lines: [
      { account_id: bankAccountId, program_id: applied.program_id, debit_cents: amount, credit_cents: 0 },
      { account_id: applied.receivable_account_id, program_id: applied.program_id, debit_cents: 0, credit_cents: amount },
    ],
  };
}

async function markInstallmentCollected(pool, { orgId, installmentId, ledgerTransactionId, date }) {
  const r = await pool.query(
    `UPDATE org_gift_pledge_installments SET status = 'collected', ledger_transaction_id = $1, collected_at = $2::date
      WHERE id = $3 AND org_id = $4 AND status = 'expected'`, [ledgerTransactionId, String(date).slice(0, 10), installmentId, orgId]);
  return r.rowCount > 0;
}

async function recordPledgeInstallmentReceipt(pool, { orgId, userId, installmentId, bankAccountId, date, amountCents, reference }) {
  const applied = await loadExpected(pool, orgId, 'pledge_installment', installmentId);
  if (!applied) return { httpStatus: 409, body: { error: 'That pledge installment is no longer open.', code: 'expected_gone' } };
  if (Number(applied.amount_cents) !== Number(amountCents)) {
    return { httpStatus: 422, body: { error: 'The bank line is a different amount than the installment. Use Create for a partial payment.', code: 'amount_mismatch' } };
  }
  const built = pledgeReceiptLines(applied, bankAccountId);
  if (built.error) return { httpStatus: 400, body: { error: built.error } };
  let payee = null;
  if (applied.constituent_id) {
    const c = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1 AND org_id = $2', [applied.constituent_id, orgId]);
    payee = c.rows[0] ? c.rows[0].display_name : null;
  }
  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: String(date).slice(0, 10), memo: 'Pledge installment received', payee,
    constituentId: applied.constituent_id || null, referenceNumber: reference || null,
    lines: built.lines, source: 'manual', entryType: 'receive', journalReason: null,
  });
  if (result.httpStatus >= 400) return result;
  await markInstallmentCollected(pool, { orgId, installmentId, ledgerTransactionId: result.body.id, date });
  return { httpStatus: 200, body: { ledger_transaction_id: result.body.id } };
}

module.exports = { pledgeReceiptLines, markInstallmentCollected, recordPledgeInstallmentReceipt };
