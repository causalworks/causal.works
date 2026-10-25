'use strict';

// Tools that post a bill when it is approved, post an invoice when it is sent, and write off an invoice's remaining balance.

const { defineTool, scopeAllows } = require('./registry');
const { acquireDocumentLock } = require('../lib/documentLock');
const { postLedgerTransaction } = require('../lib/ledgerPosting');
const { invoiceRemainingBalanceCents } = require('../lib/billInvoicePayments');
const { translateBillWriteError, translateInvoiceWriteError } = require('../lib/documentWriteErrors');
const { sendInvoiceEmail } = require('../lib/sendInvoiceEmail');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };
const bad = (error) => ({ httpStatus: 400, body: { error } });
const notFound = (what) => ({ httpStatus: 404, body: { error: what + ' not found' } });

async function locked(ctx, key, translate, fn) {
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } catch (e) {
    const t = translate(e);
    if (t) return { httpStatus: t.status, body: t.body };
    throw e;
  } finally { await lock.release(); }
}

defineTool({
  name: 'bill.approve',
  capability: 'approve',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id } } : { error: 'Invalid id' }; },
  run: (ctx, { id: billId }) => locked(ctx, 'bill:' + billId, translateBillWriteError, async () => {
    const { pool, orgId, userId } = ctx;
    const r = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
    if (!r.rows.length) return notFound('Bill');
    const bill = r.rows[0];
    const programs = (await pool.query('SELECT program_id FROM org_bill_lines WHERE bill_id = $1', [billId])).rows.map((x) => x.program_id);
    if (!scopeAllows(ctx, programs)) return notFound('Bill');
    if (bill.status !== 'pending_approval') {
      return { httpStatus: 409, body: { error: `Bill is not awaiting approval (status: ${bill.status})`, code: 'not_pending_approval' } };
    }
    if (!bill.bill_number) {
      bill.bill_number = (await pool.query(
        `UPDATE org_bills SET bill_number = org_take_document_number($2, 'bill') WHERE id = $1 AND org_id = $2 AND bill_number IS NULL RETURNING bill_number`, [billId, orgId])).rows[0].bill_number;
    }
    const approvedAt = (await pool.query(
      `UPDATE org_bills SET approved_by = $1, approved_at = NOW(), updated_at = NOW() WHERE id = $2 AND org_id = $3 RETURNING approved_at`,
      [userId, billId, orgId])).rows[0].approved_at;
    const lines = (await pool.query(
      `SELECT id, account_id, program_id, grant_id, amount_cents, line_memo FROM org_bill_lines WHERE bill_id = $1 ORDER BY id ASC`, [billId])).rows;
    const vendor = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [bill.constituent_id]);
    const apAccountId = (await pool.query('SELECT org_get_or_create_ap_account($1) AS id', [orgId])).rows[0].id;
    const totalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);
    const ledgerLines = lines.map((l) => ({
      account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
      debit_cents: Number(l.amount_cents), credit_cents: 0,
      line_memo: l.line_memo, source_line_type: 'org_bill_lines', source_line_id: l.id,
    }));
    ledgerLines.push({ account_id: apAccountId, program_id: lines[0].program_id, grant_id: null, debit_cents: 0, credit_cents: totalCents, line_memo: `AP liability for bill #${billId}` });
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: bill.bill_date,
      memo: `Bill ${bill.bill_number || '#' + billId}${bill.reference ? ' (' + bill.reference + ')' : ''}`,
      payee: vendor.rows[0] ? vendor.rows[0].display_name : null,
      referenceNumber: bill.reference, lines: ledgerLines, source: 'bill_approval', constituentId: bill.constituent_id,
      internalApproval: { approvedBy: userId, approvedAt, sourceRefId: billId, sourceRefType: 'bill' },
    });
    if (postResult.httpStatus >= 400) {
      await pool.query(`UPDATE org_bills SET approved_by = NULL, approved_at = NULL WHERE id = $1 AND org_id = $2`, [billId, orgId]);
      return postResult;
    }
    await pool.query(`UPDATE org_bills SET status = 'approved', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [postResult.body.id, billId, orgId]);
    logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
      fields: [{ fieldName: 'status', oldValue: bill.status, newValue: 'approved' }], metadata: { ...ctx.meta, ledger_transaction_id: postResult.body.id } }).catch(() => {});
    return { httpStatus: 200, body: { id: billId, status: 'approved', ledger_transaction_id: postResult.body.id } };
  }),
});

defineTool({
  name: 'invoice.send',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'Invalid id' };
    const newEmail = typeof b.customer_email === 'string' ? b.customer_email.trim() : '';
    return { value: { id, newEmail, sendEmail: b.email !== false } };
  },
  run: (ctx, { id: invoiceId, newEmail, sendEmail }) => locked(ctx, 'invoice:' + invoiceId, translateInvoiceWriteError, async () => {
    const { pool, orgId, userId } = ctx;
    const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
    if (!r.rows.length) return notFound('Invoice');
    const invoice = r.rows[0];
    const programs = (await pool.query('SELECT program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId])).rows.map((x) => x.program_id);
    if (!scopeAllows(ctx, programs)) return notFound('Invoice');
    if (invoice.status !== 'draft') return { httpStatus: 409, body: { error: `Invoice is not in draft status (status: ${invoice.status})`, code: 'not_draft' } };
    const lines = (await pool.query(
      `SELECT l.id, l.invoice_id, l.account_id, a.code AS account_code, a.name AS account_name,
              l.program_id, p.name AS program_name, l.description, l.quantity, l.unit_amount_cents,
              l.fair_market_value_cents, l.line_memo
         FROM org_invoice_lines l JOIN org_accounts a ON a.id = l.account_id JOIN org_programs p ON p.id = l.program_id
        WHERE l.invoice_id = $1 ORDER BY l.id ASC`, [invoiceId])).rows;
    if (!lines.length) return bad('Invoice has no lines');
    if (!invoice.invoice_number) {
      invoice.invoice_number = (await pool.query(
        `UPDATE org_invoices SET invoice_number = org_take_document_number($2, 'invoice') WHERE id = $1 AND org_id = $2 AND invoice_number IS NULL RETURNING invoice_number`, [invoiceId, orgId])).rows[0].invoice_number;
    }
    if (newEmail && !EMAIL_RE.test(newEmail)) return bad('That email address is not valid.');
    if (newEmail) {
      const c = await pool.query('SELECT email FROM org_constituents WHERE id = $1 AND org_id = $2', [invoice.constituent_id, orgId]);
      if (c.rows.length && !c.rows[0].email) {
        await pool.query('UPDATE org_constituents SET email = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3', [newEmail, invoice.constituent_id, orgId]);
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_constituents', recordId: invoice.constituent_id,
          fields: [{ fieldName: 'email', oldValue: null, newValue: newEmail }], metadata: ctx.meta }).catch(() => {});
      }
    }
    const customer = await pool.query('SELECT display_name, email FROM org_constituents WHERE id = $1', [invoice.constituent_id]);
    const arAccountId = (await pool.query('SELECT org_get_or_create_ar_account($1) AS id', [orgId])).rows[0].id;
    let totalCents = 0;
    const ledgerLines = [];
    let contribAccountId = null;
    for (const l of lines) {
      const lineTotal = Math.round(Number(l.quantity) * Number(l.unit_amount_cents));
      totalCents += lineTotal;
      if (l.fair_market_value_cents != null) {
        const fmvTotal = Math.round(Number(l.quantity) * Number(l.fair_market_value_cents));
        const contribTotal = lineTotal - fmvTotal;
        if (fmvTotal > 0) ledgerLines.push({ account_id: l.account_id, program_id: l.program_id, debit_cents: 0, credit_cents: fmvTotal, line_memo: l.description || l.line_memo });
        if (contribTotal > 0) {
          if (contribAccountId == null) contribAccountId = (await pool.query('SELECT org_get_or_create_contribution_revenue_account($1) AS id', [orgId])).rows[0].id;
          ledgerLines.push({ account_id: contribAccountId, program_id: l.program_id, debit_cents: 0, credit_cents: contribTotal, line_memo: `Quid pro quo split -- contribution portion of: ${l.description || 'invoice line'}` });
        }
      } else {
        ledgerLines.push({ account_id: l.account_id, program_id: l.program_id, debit_cents: 0, credit_cents: lineTotal, line_memo: l.description || l.line_memo, source_line_type: 'org_invoice_lines', source_line_id: l.id });
      }
    }
    ledgerLines.unshift({ account_id: arAccountId, program_id: lines[0].program_id, debit_cents: totalCents, credit_cents: 0, line_memo: `AR for invoice #${invoiceId}` });
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: invoice.invoice_date,
      memo: `Invoice ${invoice.invoice_number || '#' + invoiceId}${invoice.reference ? ' (' + invoice.reference + ')' : ''}`,
      payee: customer.rows[0] ? customer.rows[0].display_name : null,
      referenceNumber: invoice.reference, lines: ledgerLines, source: 'invoice', constituentId: invoice.constituent_id,
    });
    if (postResult.httpStatus >= 400) return postResult;
    await pool.query(`UPDATE org_invoices SET status = 'sent', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [postResult.body.id, invoiceId, orgId]);
    logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
      fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: 'sent' }], metadata: { ...ctx.meta, ledger_transaction_id: postResult.body.id } }).catch(() => {});
    let emailed = 'skipped';
    if (sendEmail) {
      try {
        emailed = await sendInvoiceEmail(pool, { orgId, invoice, customerName: customer.rows[0] && customer.rows[0].display_name,
          customerEmail: customer.rows[0] && customer.rows[0].email, lines, totalCents });
      } catch (mailErr) { console.error('invoice email:', mailErr.message); emailed = 'failed'; }
    }
    return { httpStatus: 200, body: { id: invoiceId, status: 'sent', ledger_transaction_id: postResult.body.id, emailed } };
  }),
});

defineTool({
  name: 'invoice.write_off',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    if (!id) return { error: 'Invalid id' };
    const badDebtAccountId = posInt(b.bad_debt_expense_account_id);
    if (!badDebtAccountId) return { error: 'bad_debt_expense_account_id is required' };
    const reason = b.reason != null ? String(b.reason).trim() : '';
    if (!reason) return { error: 'A reason for the write-off is required.' };
    const date = b.date != null && b.date !== '' ? String(b.date) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(date)) return { error: 'date must be YYYY-MM-DD' };
    return { value: { id, badDebtAccountId, reason, date } };
  },
  run: (ctx, v) => locked(ctx, 'invoice:' + v.id, translateInvoiceWriteError, async () => {
    const { pool, orgId, userId } = ctx;
    const invoiceId = v.id;
    const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
    if (!r.rows.length) return notFound('Invoice');
    const invoice = r.rows[0];
    const programs = (await pool.query('SELECT program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId])).rows.map((x) => x.program_id);
    if (!scopeAllows(ctx, programs)) return notFound('Invoice');
    if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
      return { httpStatus: 409, body: { error: `Invoice cannot be written off from status ${invoice.status}`, code: 'not_writeoffable' } };
    }
    const { remainingCents } = await invoiceRemainingBalanceCents(pool, invoiceId);
    if (remainingCents <= 0) return { httpStatus: 409, body: { error: 'Invoice has no remaining balance to write off', code: 'nothing_to_write_off' } };
    const programId = (await pool.query('SELECT MIN(program_id) AS program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId])).rows[0].program_id;
    const arAccountId = (await pool.query('SELECT org_get_or_create_ar_account($1) AS id', [orgId])).rows[0].id;
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: v.date, memo: `Write-off for invoice #${invoiceId}`, payee: null,
      constituentId: invoice.constituent_id, referenceNumber: invoice.reference,
      lines: [
        { account_id: v.badDebtAccountId, program_id: programId, debit_cents: remainingCents, credit_cents: 0, line_memo: `Bad debt write-off, invoice #${invoiceId}: ${v.reason}` },
        { account_id: arAccountId, program_id: programId, debit_cents: 0, credit_cents: remainingCents, line_memo: `Write-off, invoice #${invoiceId}` },
      ],
      source: 'invoice',
    });
    if (postResult.httpStatus >= 400) return postResult;
    await pool.query(`UPDATE org_invoices SET status = 'written_off', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [invoiceId, orgId]);
    logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
      fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: 'written_off' }],
      metadata: { ...ctx.meta, reason: v.reason, remaining_cents: remainingCents, bad_debt_expense_account_id: v.badDebtAccountId, date: v.date } }).catch(() => {});
    return { httpStatus: 200, body: { id: invoiceId, status: 'written_off', ledger_transaction_id: postResult.body.id } };
  }),
});
