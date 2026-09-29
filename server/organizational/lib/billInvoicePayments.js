'use strict';

// Bill/invoice payment recording, extracted from bills.js/invoices.js so there is exactly one
// posting path regardless of entry point: the bill/invoice detail panel's "Record payment"
// button and Bank Reconciliation's Match action both call these same functions. Built this way
// specifically to close a real duplicate-entry risk -- Xero's own docs document coding a bank
// line as a fresh Spend/Receive Money transaction instead of matching it to an existing
// bill/invoice as a common cause of duplicated entries and a wrong bank balance; reusing one
// function for both call sites makes that class of bug structurally impossible here, not just
// disciplined about.

const { postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, buildReversingLines } = require('./ledgerPosting');

async function invoiceRemainingBalanceCents(pool, invoiceId) {
  const r = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = $1), 0)::bigint AS total_cents,
       COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = $1 AND status = 'posted'), 0)::bigint AS paid_cents`,
    [invoiceId]
  );
  const totalCents = Number(r.rows[0].total_cents);
  const paidCents = Number(r.rows[0].paid_cents);
  return { totalCents, paidCents, remainingCents: totalCents - paidCents };
}

async function billRemainingBalanceCents(pool, billId) {
  const r = await pool.query(
    `SELECT
       COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = $1), 0)::bigint AS total_cents,
       COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = $1 AND status = 'posted'), 0)::bigint AS paid_cents`,
    [billId]
  );
  const totalCents = Number(r.rows[0].total_cents);
  const paidCents = Number(r.rows[0].paid_cents);
  return { totalCents, paidCents, remainingCents: totalCents - paidCents };
}

/**
 * Bills support real partial payment (matching invoices) -- amountCents is caller-supplied and
 * validated against the remaining balance.
 */
async function recordBillPayment(pool, { orgId, userId, billId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Bill not found' } };
  const bill = r.rows[0];
  if (!['approved', 'scheduled', 'partially_paid'].includes(bill.status)) {
    return { httpStatus: 409, body: { error: `Bill cannot receive a payment from status ${bill.status}`, code: 'not_approved' } };
  }

  const { remainingCents } = await billRemainingBalanceCents(pool, billId);
  if (amountCents > remainingCents) {
    return { httpStatus: 422, body: { error: `amount_cents (${amountCents}) exceeds the remaining balance (${remainingCents})`, code: 'exceeds_remaining_balance' } };
  }

  const linesR = await pool.query('SELECT MIN(program_id) AS program_id FROM org_bill_lines WHERE bill_id = $1', [billId]);
  const vendorR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [bill.constituent_id]);
  const apAccountR = await pool.query('SELECT org_get_or_create_ap_account($1) AS id', [orgId]);
  const apAccountId = apAccountR.rows[0].id;

  const postResult = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: paymentDate,
    memo: `Payment for bill #${billId}`,
    payee: vendorR.rows[0] ? vendorR.rows[0].display_name : null,
    referenceNumber: reference || null,
    lines: [
      { account_id: apAccountId, program_id: linesR.rows[0].program_id, debit_cents: amountCents, credit_cents: 0, line_memo: `AP liability cleared for bill #${billId}` },
      { account_id: bankAccountId, program_id: linesR.rows[0].program_id, debit_cents: 0, credit_cents: amountCents, line_memo: `Payment for bill #${billId}` },
    ],
    source: 'bill_payment',
  });
  if (postResult.httpStatus >= 400) return postResult;

  const fyR = await pool.query('SELECT fiscal_year FROM org_ledger_transactions WHERE id = $1', [postResult.body.id]);
  const paymentR = await pool.query(
    `INSERT INTO org_bill_payments (org_id, bill_id, bank_account_id, payment_date, amount_cents, reference, ledger_transaction_id, fiscal_year, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, billId, bankAccountId, paymentDate, amountCents, reference || null, postResult.body.id, fyR.rows[0].fiscal_year, userId]
  );

  const newStatus = amountCents === remainingCents ? 'paid' : 'partially_paid';
  await pool.query(`UPDATE org_bills SET status = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [newStatus, billId, orgId]);
  return { httpStatus: 201, body: { id: paymentR.rows[0].id, bill_status: newStatus, ledger_transaction_id: postResult.body.id, amount_cents: String(amountCents) } };
}

async function voidBillPayment(pool, { orgId, userId, billId, paymentId, reason }) {
  const payR = await pool.query('SELECT * FROM org_bill_payments WHERE id = $1 AND bill_id = $2 AND org_id = $3', [paymentId, billId, orgId]);
  if (!payR.rows.length) return { httpStatus: 404, body: { error: 'Payment not found' } };
  const payment = payR.rows[0];
  if (payment.status !== 'posted') return { httpStatus: 409, body: { error: 'Payment is not in a voidable state', code: 'not_voidable' } };

  const txnR = await pool.query('SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [payment.ledger_transaction_id, orgId]);
  const txn = txnR.rows[0];
  const locked = await isFiscalYearLocked(pool, orgId, txn.fiscal_year);

  let reversalTransactionId = null;
  if (!locked) {
    const voidResult = await voidLedgerTransaction(pool, { orgId, userId, transactionId: txn.id, voidReason: reason });
    if (voidResult.httpStatus >= 400) return voidResult;
  } else {
    const originalLinesR = await pool.query(
      `SELECT account_id, program_id, grant_id, donor_restriction_class::text AS donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
       FROM org_ledger_lines WHERE transaction_id = $1`,
      [txn.id]
    );
    const reverseResult = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: new Date().toISOString().slice(0, 10),
      memo: `Reversal of bill #${billId} payment (originally FY${txn.fiscal_year}, now locked): ${reason}`,
      payee: txn.payee,
      referenceNumber: null,
      lines: buildReversingLines(originalLinesR.rows),
      source: 'bill_payment',
      reversesTransactionId: txn.id,
    });
    if (reverseResult.httpStatus >= 400) return reverseResult;
    reversalTransactionId = reverseResult.body.id;
  }

  await pool.query(`UPDATE org_bill_payments SET status = 'void' WHERE id = $1 AND org_id = $2`, [paymentId, orgId]);
  const { paidCents, remainingCents } = await billRemainingBalanceCents(pool, billId);
  const newStatus = paidCents === 0 ? 'approved' : remainingCents === 0 ? 'paid' : 'partially_paid';
  await pool.query(`UPDATE org_bills SET status = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [newStatus, billId, orgId]);
  return { httpStatus: 200, body: { id: paymentId, status: 'void', bill_status: newStatus, reversal_transaction_id: reversalTransactionId } };
}

/**
 * Invoices support real partial payment (the schema's `partially_paid` status, unused until
 * this was built) -- amountCents is caller-supplied and validated against the remaining balance.
 */
async function recordInvoicePayment(pool, { orgId, userId, invoiceId, bankAccountId, paymentDate, amountCents, reference }) {
  const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'Invoice not found' } };
  const invoice = r.rows[0];
  if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
    return { httpStatus: 409, body: { error: `Invoice cannot receive a payment from status ${invoice.status}`, code: 'not_payable' } };
  }

  const { remainingCents } = await invoiceRemainingBalanceCents(pool, invoiceId);
  if (amountCents > remainingCents) {
    return { httpStatus: 422, body: { error: `amount_cents (${amountCents}) exceeds the remaining balance (${remainingCents})`, code: 'exceeds_remaining_balance' } };
  }

  const linesR = await pool.query('SELECT MIN(program_id) AS program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
  const customerR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [invoice.constituent_id]);
  const arAccountR = await pool.query('SELECT org_get_or_create_ar_account($1) AS id', [orgId]);
  const arAccountId = arAccountR.rows[0].id;

  const postResult = await postLedgerTransaction(pool, {
    orgId, userId,
    transactionDate: paymentDate,
    memo: `Payment received for invoice #${invoiceId}`,
    payee: customerR.rows[0] ? customerR.rows[0].display_name : null,
    referenceNumber: reference || null,
    lines: [
      { account_id: bankAccountId, program_id: linesR.rows[0].program_id, debit_cents: amountCents, credit_cents: 0, line_memo: `Payment received for invoice #${invoiceId}` },
      { account_id: arAccountId, program_id: linesR.rows[0].program_id, debit_cents: 0, credit_cents: amountCents, line_memo: `AR reduced for invoice #${invoiceId}` },
    ],
    source: 'invoice_payment',
  });
  if (postResult.httpStatus >= 400) return postResult;

  const fyR = await pool.query('SELECT fiscal_year FROM org_ledger_transactions WHERE id = $1', [postResult.body.id]);
  const paymentR = await pool.query(
    `INSERT INTO org_invoice_payments (org_id, invoice_id, bank_account_id, payment_date, amount_cents, reference, ledger_transaction_id, fiscal_year, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [orgId, invoiceId, bankAccountId, paymentDate, amountCents, reference || null, postResult.body.id, fyR.rows[0].fiscal_year, userId]
  );

  const newStatus = amountCents === remainingCents ? 'paid' : 'partially_paid';
  await pool.query(`UPDATE org_invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [newStatus, invoiceId, orgId]);
  return { httpStatus: 201, body: { id: paymentR.rows[0].id, invoice_status: newStatus, ledger_transaction_id: postResult.body.id } };
}

async function voidInvoicePayment(pool, { orgId, userId, invoiceId, paymentId, reason }) {
  const payR = await pool.query('SELECT * FROM org_invoice_payments WHERE id = $1 AND invoice_id = $2 AND org_id = $3', [paymentId, invoiceId, orgId]);
  if (!payR.rows.length) return { httpStatus: 404, body: { error: 'Payment not found' } };
  const payment = payR.rows[0];
  if (payment.status !== 'posted') return { httpStatus: 409, body: { error: 'Payment is not in a voidable state', code: 'not_voidable' } };

  const txnR = await pool.query('SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [payment.ledger_transaction_id, orgId]);
  const txn = txnR.rows[0];
  const locked = await isFiscalYearLocked(pool, orgId, txn.fiscal_year);

  let reversalTransactionId = null;
  if (!locked) {
    const voidResult = await voidLedgerTransaction(pool, { orgId, userId, transactionId: txn.id, voidReason: reason });
    if (voidResult.httpStatus >= 400) return voidResult;
  } else {
    const originalLinesR = await pool.query(
      `SELECT account_id, program_id, grant_id, donor_restriction_class::text AS donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
       FROM org_ledger_lines WHERE transaction_id = $1`,
      [txn.id]
    );
    const reverseResult = await postLedgerTransaction(pool, {
      orgId, userId,
      transactionDate: new Date().toISOString().slice(0, 10),
      memo: `Reversal of invoice #${invoiceId} payment (originally FY${txn.fiscal_year}, now locked): ${reason}`,
      payee: txn.payee,
      referenceNumber: null,
      lines: buildReversingLines(originalLinesR.rows),
      source: 'invoice_payment',
      reversesTransactionId: txn.id,
    });
    if (reverseResult.httpStatus >= 400) return reverseResult;
    reversalTransactionId = reverseResult.body.id;
  }

  await pool.query(`UPDATE org_invoice_payments SET status = 'void' WHERE id = $1 AND org_id = $2`, [paymentId, orgId]);
  const { paidCents, remainingCents } = await invoiceRemainingBalanceCents(pool, invoiceId);
  const newStatus = paidCents === 0 ? 'sent' : remainingCents === 0 ? 'paid' : 'partially_paid';
  await pool.query(`UPDATE org_invoices SET status = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [newStatus, invoiceId, orgId]);
  return { httpStatus: 200, body: { id: paymentId, status: 'void', invoice_status: newStatus, reversal_transaction_id: reversalTransactionId } };
}

module.exports = {
  invoiceRemainingBalanceCents,
  billRemainingBalanceCents,
  recordBillPayment, voidBillPayment,
  recordInvoicePayment, voidInvoicePayment,
};
