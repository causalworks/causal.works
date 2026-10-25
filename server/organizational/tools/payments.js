'use strict';

// Tools that record or void a payment against a bill or an invoice.

const { defineTool, scopeAllows } = require('./registry');
const { recordBillPayment, voidBillPayment, recordInvoicePayment, voidInvoicePayment } = require('../lib/billInvoicePayments');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };

function validateRecord(kind, idKey) {
  return (input) => {
    const id = posInt(input[idKey]);
    if (!id) return { error: 'Invalid id' };
    const bankAccountId = posInt(input.bank_account_id);
    if (!bankAccountId) return { error: 'bank_account_id is required' };
    const paymentDate = input.payment_date != null ? String(input.payment_date) : null;
    if (!paymentDate || !DATE_RE.test(paymentDate)) return { error: 'payment_date is required and must be YYYY-MM-DD' };
    const amountCents = Number.parseInt(String(input.amount_cents), 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: 'amount_cents must be a positive integer' };
    return { value: { id, bankAccountId, paymentDate, amountCents, reference: input.reference || null } };
  };
}

function validateVoid(idKey) {
  return (input) => {
    const id = posInt(input[idKey]);
    const paymentId = posInt(input.payment_id);
    if (!id || !paymentId) return { error: 'Invalid id' };
    const reason = input.reason != null ? String(input.reason).trim() : '';
    if (!reason) return { error: 'reason is required' };
    return { value: { id, paymentId, reason } };
  };
}

const KINDS = {
  bill: {
    table: 'org_bills', linesTable: 'org_bill_lines', fk: 'bill_id', label: 'Bill',
    record: (pool, a) => recordBillPayment(pool, { ...a, billId: a.id }),
    void: (pool, a) => voidBillPayment(pool, { ...a, billId: a.id }),
    reconciledSql: `SELECT 1 FROM org_bank_statement_lines s JOIN org_bill_payments p ON p.ledger_transaction_id = s.ledger_transaction_id
                     WHERE s.org_id = $1 AND p.id = $2 LIMIT 1`,
  },
  invoice: {
    table: 'org_invoices', linesTable: 'org_invoice_lines', fk: 'invoice_id', label: 'Invoice',
    record: (pool, a) => recordInvoicePayment(pool, { ...a, invoiceId: a.id }),
    void: (pool, a) => voidInvoicePayment(pool, { ...a, invoiceId: a.id }),
    reconciledSql: `SELECT 1 FROM org_bank_statement_lines s JOIN org_invoice_payments p ON p.ledger_transaction_id = s.ledger_transaction_id
                     WHERE s.org_id = $1 AND p.id = $2 LIMIT 1`,
  },
};

async function inScope(ctx, k, id) {
  if (ctx.programScope === null || ctx.programScope === undefined) return true;
  const r = await ctx.pool.query(`SELECT program_id FROM ${k.linesTable} WHERE ${k.fk} = $1`, [id]);
  return scopeAllows(ctx, r.rows.map((row) => row.program_id));
}

for (const [kind, k] of Object.entries(KINDS)) {
  defineTool({
    name: `${kind}.record_payment`,
    capability: 'post',
    nonHuman: 'propose',
    validate: validateRecord(kind, 'id'),
    async run(ctx, v) {
      if (!(await inScope(ctx, k, v.id))) return { httpStatus: 404, body: { error: `${k.label} not found` } };
      const result = await k.record(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, id: v.id, bankAccountId: v.bankAccountId, paymentDate: v.paymentDate, amountCents: v.amountCents, reference: v.reference });
      if (result.httpStatus < 400) {
        logAudit(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, action: 'update', tableName: k.table, recordId: v.id, fields: [{ fieldName: 'Payment recorded', oldValue: null, newValue: '$' + (v.amountCents / 100).toFixed(2) + ' on ' + v.paymentDate }], metadata: ctx.meta }).catch(() => {});
      }
      return result;
    },
  });

  defineTool({
    name: `${kind}.void_payment`,
    capability: 'post',
    nonHuman: 'propose',
    validate: validateVoid('id'),
    async run(ctx, v) {
      if (!(await inScope(ctx, k, v.id))) return { httpStatus: 404, body: { error: `${k.label} not found` } };
      const recon = ctx.viaBank ? { rows: [] } : await ctx.pool.query(k.reconciledSql, [ctx.orgId, v.paymentId]);
      if (recon.rows.length) return { httpStatus: 409, body: { error: 'This payment is reconciled to a bank line. Unreconcile it first.', code: 'reconciled' } };
      const result = await k.void(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, id: v.id, paymentId: v.paymentId, reason: v.reason });
      if (result.httpStatus < 400) {
        logAudit(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, action: 'update', tableName: k.table, recordId: v.id, fields: [{ fieldName: 'Payment voided', oldValue: null, newValue: 'payment #' + v.paymentId }], metadata: { ...ctx.meta, reason: v.reason } }).catch(() => {});
      }
      return result;
    },
  });
}
