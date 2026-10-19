'use strict';

const { billCreditSql, invoiceCreditSql } = require('./billInvoicePayments');

// Open receivable and payable items, shared by the schedules and the Accounting dashboard so both show the same totals.

async function receivableItems(pool, orgId) {
  const inv = await pool.query(
    `SELECT i.id, i.reference, i.invoice_date AS date, i.due_date, i.ledger_transaction_id, c.id AS contact_id, c.display_name AS contact_name,
            COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0)
            - COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = i.id AND status = 'posted'), 0) - ${invoiceCreditSql('i')} AS balance_cents
       FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
      WHERE i.org_id = $1 AND i.status IN ('sent', 'partially_paid', 'overdue')`, [orgId]);
  const inst = await pool.query(
    `SELECT i.id, i.due_date, i.amount_cents AS balance_cents, g.id AS gift_id, g.received_at::date AS date, g.ledger_transaction_id,
            c.id AS contact_id, c.display_name AS contact_name
       FROM org_gift_pledge_installments i
       JOIN org_gifts g ON g.id = i.gift_id
       LEFT JOIN org_constituents c ON c.id = g.constituent_id
      WHERE i.org_id = $1 AND i.status = 'expected' AND g.gift_type = 'pledge' AND g.posting_status = 'posted'`, [orgId]);
  const whole = await pool.query(
    `SELECT g.id AS gift_id, g.amount_cents AS balance_cents, g.received_at::date AS date, g.ledger_transaction_id,
            c.id AS contact_id, c.display_name AS contact_name
       FROM org_gifts g LEFT JOIN org_constituents c ON c.id = g.constituent_id
      WHERE g.org_id = $1 AND g.gift_type = 'pledge' AND g.posting_status = 'posted'
        AND NOT EXISTS (SELECT 1 FROM org_gift_pledge_installments i WHERE i.gift_id = g.id)`, [orgId]);
  return [
    ...inv.rows.filter((r) => Number(r.balance_cents) > 0).map((r) => ({
      kind: 'invoice', id: r.id, reference: r.reference || 'Invoice #' + r.id, contact_id: r.contact_id, contact_name: r.contact_name,
      date: r.date, due_date: r.due_date, balance_cents: r.balance_cents, ledger_transaction_id: r.ledger_transaction_id })),
    ...inst.rows.map((r) => ({
      kind: 'pledge', id: r.id, reference: 'Pledge installment (gift #' + r.gift_id + ')', contact_id: r.contact_id, contact_name: r.contact_name || '(no donor)',
      date: r.date, due_date: r.due_date, balance_cents: r.balance_cents, ledger_transaction_id: r.ledger_transaction_id })),
    ...whole.rows.map((r) => ({
      kind: 'pledge', id: r.gift_id, reference: 'Pledge, no installments (gift #' + r.gift_id + ')', contact_id: r.contact_id, contact_name: r.contact_name || '(no donor)',
      date: r.date, due_date: null, balance_cents: r.balance_cents, ledger_transaction_id: r.ledger_transaction_id })),
  ];
}

async function payableItems(pool, orgId) {
  const bills = await pool.query(
    `SELECT b.id, b.reference, b.bill_date AS date, b.due_date, b.ledger_transaction_id, c.id AS contact_id, c.display_name AS contact_name,
            COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0)
            - COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = b.id AND status = 'posted'), 0) - ${billCreditSql('b')} AS balance_cents
       FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
      WHERE b.org_id = $1 AND b.status IN ('approved', 'scheduled', 'partially_paid')`, [orgId]);
  const claims = await pool.query(
    `SELECT e.id, e.description, e.claim_date AS date, e.ledger_transaction_id, COALESCE(NULLIF(pc.display_name, ''), u.email) AS contact_name,
            COALESCE((SELECT SUM(amount_cents) FROM org_expense_claim_lines WHERE claim_id = e.id), 0) AS balance_cents
       FROM org_expense_claims e LEFT JOIN users u ON u.id = e.submitted_by
       LEFT JOIN LATERAL (SELECT c.display_name FROM org_constituents c WHERE c.org_id = e.org_id AND lower(c.email) = lower(u.email) ORDER BY c.id LIMIT 1) pc ON TRUE
      WHERE e.org_id = $1 AND e.status = 'approved'`, [orgId]);
  return [
    ...bills.rows.filter((r) => Number(r.balance_cents) > 0).map((r) => ({
      kind: 'bill', id: r.id, reference: r.reference || 'Bill #' + r.id, contact_id: r.contact_id, contact_name: r.contact_name,
      date: r.date, due_date: r.due_date, balance_cents: r.balance_cents, ledger_transaction_id: r.ledger_transaction_id })),
    ...claims.rows.filter((r) => Number(r.balance_cents) > 0).map((r) => ({
      kind: 'claim', id: r.id, reference: r.description || 'Expense claim #' + r.id, contact_id: null, contact_name: r.contact_name || '(staff)',
      date: r.date, due_date: null, balance_cents: r.balance_cents, ledger_transaction_id: r.ledger_transaction_id })),
  ];
}

module.exports = { receivableItems, payableItems };
