'use strict';
const { addFileInfo } = require('../lib/recordFiles');

const multer = require('multer');
const { displayCents } = require('../lib/voidedDisplay');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLocked, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { runTool, ctxFromReq } = require('../tools');
const { billCreditSql, invoiceCreditSql } = require('../lib/billInvoicePayments');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { translateInvoiceWriteError } = require('../lib/documentWriteErrors');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');
const { sendInvoiceEmail } = require('../lib/sendInvoiceEmail');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const { parseInvoiceLines, replaceInvoiceLines: replaceLines, INVOICE_LINES_SELECT: LINES_SELECT } = require('../lib/documentLines');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rowToInvoice(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    constituent_id: row.constituent_id,
    customer_name: row.customer_name || null,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    reference: row.reference,
    invoice_number: row.invoice_number || null,
    status: row.status,
    ledger_transaction_id: row.ledger_transaction_id,
    membership_payment_id: row.membership_payment_id,
    fiscal_year: row.fiscal_year,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    total_cents: row.total_cents != null ? String(row.total_cents) : undefined,
    display_total_cents: row.total_cents != null ? String(displayCents(row.status, row.total_cents)) : undefined,
  };
}

function rowToInvoicePayment(row) {
  return {
    id: row.id, invoice_id: row.invoice_id,
    bank_account_id: row.bank_account_id, bank_account_code: row.bank_account_code, bank_account_name: row.bank_account_name,
    payment_date: row.payment_date, amount_cents: String(row.amount_cents), reference: row.reference,
    status: row.status, ledger_transaction_id: row.ledger_transaction_id,
    created_by: row.created_by, created_at: row.created_at,
    statement_line_id: row.statement_line_id || null,
  };
}

function rowToInvoiceLine(row) {
  return {
    id: row.id,
    invoice_id: row.invoice_id,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    description: row.description,
    quantity: Number(row.quantity),
    unit_amount_cents: String(row.unit_amount_cents),
    fair_market_value_cents: row.fair_market_value_cents != null ? String(row.fair_market_value_cents) : null,
    line_total_cents: String(Math.round(Number(row.quantity) * Number(row.unit_amount_cents))),
    line_memo: row.line_memo,
  };
}

async function invoiceLinePrograms(pool, invoiceId) {
  const r = await pool.query('SELECT program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
  return r.rows.map((row) => row.program_id);
}

function registerInvoicesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  app.get('/api/organizational/orgs/:slug/invoices', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const status = req.query.status != null ? String(req.query.status) : null;
    const constituentId = req.query.constituent_id != null ? Number.parseInt(String(req.query.constituent_id), 10) : null;
    try {
      const conds = ['i.org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (status) { conds.push(`i.status = $${p}`); params.push(status); p += 1; }
      if (Number.isInteger(constituentId) && constituentId > 0) { conds.push(`i.constituent_id = $${p}`); params.push(constituentId); p += 1; }

      const scopeClause = appendProgramScopeExistsClause(req, { linesTable: 'org_invoice_lines', fkColumn: 'invoice_id', parentIdExpr: 'i.id' }, params);

      const r = await pool.query(
        `SELECT i.*, c.display_name AS customer_name,
                COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0) AS total_cents
         FROM org_invoices i
         JOIN org_constituents c ON c.id = i.constituent_id
         WHERE ${conds.join(' AND ')}${scopeClause}
         ORDER BY i.invoice_date DESC, i.id DESC
         LIMIT 500`,
        params
      );
      const invoices = r.rows.map(rowToInvoice);
      await addFileInfo(pool, orgId, invoices, 'invoice');
      return res.json({ invoices });
    } catch (e) {
      console.error('GET invoices:', e.message);
      return res.status(500).json({ error: 'Could not load invoices' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/ocr-preview', ...orgAuth, financeWriter, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    try {
      const { extracted, error } = await extractBillOrInvoiceFields(req.file.buffer, req.file.mimetype, 'invoice');
      if (error) return res.status(422).json({ error });
      return res.json({ extracted });
    } catch (e) {
      console.error('POST invoices/ocr-preview:', e.message);
      return res.status(500).json({ error: 'Could not scan this document' });
    }
  });

  app.get('/api/organizational/orgs/:slug/invoices/customer-coding-suggestion', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const constituentId = Number.parseInt(String(req.query.constituent_id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id is required' });
    try {
      const r = await pool.query(
        `SELECT l.account_id, a.code AS account_code, a.name AS account_name, l.program_id, p.name AS program_name
         FROM org_invoices i
         JOIN (SELECT invoice_id, COUNT(*) AS line_count FROM org_invoice_lines GROUP BY invoice_id) lc ON lc.invoice_id = i.id AND lc.line_count = 1
         JOIN org_invoice_lines l ON l.invoice_id = i.id
         JOIN org_accounts a ON a.id = l.account_id
         JOIN org_programs p ON p.id = l.program_id
         WHERE i.org_id = $1 AND i.constituent_id = $2
         ORDER BY i.invoice_date DESC, i.id DESC
         LIMIT 1`,
        [orgId, constituentId]
      );
      if (!r.rows.length) return res.json({ suggestion: null });
      const row = r.rows[0];
      return res.json({
        suggestion: {
          account_id: row.account_id, account_code: row.account_code, account_name: row.account_name,
          program_id: row.program_id, program_name: row.program_name,
        },
      });
    } catch (e) {
      console.error('GET invoices/customer-coding-suggestion:', e.message);
      return res.status(500).json({ error: 'Could not load coding suggestion' });
    }
  });

  app.get('/api/organizational/orgs/:slug/invoices/aging-report', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT i.id, i.reference, i.invoice_date, i.due_date, c.display_name AS customer_name,
                COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0)
                  - COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = i.id AND status = 'posted'), 0) - ${invoiceCreditSql('i')} AS total_cents,
                (CURRENT_DATE - COALESCE(i.due_date, i.invoice_date)) AS days_past_due
         FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
         WHERE i.org_id = $1 AND i.status IN ('sent', 'partially_paid', 'overdue')
         ORDER BY days_past_due DESC`,
        [orgId]
      );
      const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], '90_plus': [] };
      const totals = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
      for (const row of r.rows) {
        const days = Number(row.days_past_due);
        const key = days <= 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : '90_plus';
        const entry = { id: row.id, reference: row.reference, customer_name: row.customer_name, invoice_date: row.invoice_date, due_date: row.due_date, total_cents: String(row.total_cents), days_past_due: days };
        buckets[key].push(entry);
        totals[key] += Number(row.total_cents);
      }
      return res.json({ buckets, totals });
    } catch (e) {
      console.error('GET invoices/aging-report:', e.message);
      return res.status(500).json({ error: 'Could not load AR aging report' });
    }
  });

  app.get('/api/organizational/orgs/:slug/invoices/:id', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT i.*, c.display_name AS customer_name, c.email AS contact_email, c.phone AS contact_phone, c.mailing_address AS contact_address,
                COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0) AS total_cents,
                ${invoiceCreditSql('i')} AS credited_cents
         FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
         WHERE i.id = $1 AND i.org_id = $2 LIMIT 1`,
        [invoiceId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const linesR = await pool.query(LINES_SELECT, [invoiceId]);
      if (linesR.rows.length === 0 && programScopeFor(req) !== null) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      return res.json({ invoice: { ...rowToInvoice(r.rows[0]), credited_cents: String(r.rows[0].credited_cents), contact_email: r.rows[0].contact_email || null, contact_phone: r.rows[0].contact_phone || null, contact_address: r.rows[0].contact_address || null }, lines: linesR.rows.map(rowToInvoiceLine) });
    } catch (e) {
      console.error('GET invoice detail:', e.message);
      return res.status(500).json({ error: 'Could not load invoice' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};

    const constituentId = Number.parseInt(String(body.constituent_id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id is required' });
    const invoiceDate = body.invoice_date != null ? String(body.invoice_date) : null;
    if (!invoiceDate || !DATE_RE.test(invoiceDate)) return res.status(400).json({ error: 'invoice_date is required and must be YYYY-MM-DD' });
    const dueDate = body.due_date != null ? String(body.due_date) : null;
    if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });

    const { error, parsedLines } = parseInvoiceLines(body.lines);
    if (error) return res.status(400).json({ error });
    if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
      return res.status(403).json({ error: 'You do not have access to create an invoice with lines outside your granted program(s).' });
    }

    let fiscalYear;
    try {
      const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
      fiscalYear = fiscalYearForDate(invoiceDate, fyEndMonth);
    } catch (e) {
      console.error('POST invoices (fiscal year resolve):', e.message);
      return res.status(500).json({ error: 'Could not resolve fiscal year for this invoice date' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO org_invoices (org_id, invoice_number, constituent_id, invoice_date, due_date, reference, fiscal_year, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, invoice_number`,
        [orgId, String(body.invoice_number || '').trim() || null, constituentId, invoiceDate, dueDate, body.reference != null ? String(body.reference) : null, fiscalYear, userId]
      );
      const invoiceId = r.rows[0].id;
      await replaceLines(client, invoiceId, parsedLines);
      await client.query('COMMIT');
      logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_invoices', recordId: invoiceId, metadata: reqMeta(req) }).catch(() => {});
      return res.status(201).json({ id: invoiceId, status: 'draft', invoice_number: r.rows[0].invoice_number });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoices:', e.message);
      return res.status(500).json({ error: 'Could not create invoice' });
    } finally {
      client.release();
    }
  });


  app.patch('/api/organizational/orgs/:slug/invoices/:id', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const out = await runTool('invoice.update', ctxFromReq(pool, req), { ...(req.body || {}), id: req.params.id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('PATCH invoice:', e.message);
      return res.status(500).json({ error: 'Could not update invoice' });
    }
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  async function saveCustomerEmail(pool, { orgId, userId, req, constituentId, email }) {
    const r = await pool.query('SELECT email FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, orgId]);
    if (!r.rows.length || r.rows[0].email) return;
    await pool.query('UPDATE org_constituents SET email = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3', [email, constituentId, orgId]);
    logAudit(pool, {
      orgId, userId, action: 'update', tableName: 'org_constituents', recordId: constituentId,
      fields: [{ fieldName: 'email', oldValue: null, newValue: email }], metadata: reqMeta(req),
    }).catch(() => {});
  }

  app.post('/api/organizational/orgs/:slug/invoices/:id/send', ...orgAuth, financeWriter, async (req, res) => {
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const out = await runTool('invoice.send', ctxFromReq(pool, req), { ...(req.body || {}), id: invoiceId });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST invoice send:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not send invoice' });
    }
  });

  app.get('/api/organizational/orgs/:slug/invoices/:id/payments', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT p.*, a.code AS bank_account_code, a.name AS bank_account_name,
                COALESCE((SELECT l.id FROM org_bank_statement_lines l WHERE l.org_id = p.org_id AND l.ledger_transaction_id = p.ledger_transaction_id LIMIT 1),
                         (SELECT sp.statement_line_id FROM org_bank_statement_line_postings sp WHERE sp.ledger_transaction_id = p.ledger_transaction_id LIMIT 1)) AS statement_line_id
         FROM org_invoice_payments p JOIN org_accounts a ON a.id = p.bank_account_id
         WHERE p.invoice_id = $1 AND p.org_id = $2
         ORDER BY p.payment_date DESC, p.id DESC`,
        [invoiceId, orgId]
      );
      return res.json({ payments: r.rows.map(rowToInvoicePayment) });
    } catch (e) {
      console.error('GET invoice payments:', e.message);
      return res.status(500).json({ error: 'Could not load payments' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/payments', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const result = await runTool('invoice.record_payment', ctxFromReq(pool, req), { ...(req.body || {}), id: req.params.id });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice payment:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/payments/:paymentId/void', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const result = await runTool('invoice.void_payment', ctxFromReq(pool, req), { id: req.params.id, payment_id: req.params.paymentId, reason: req.body && req.body.reason });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST invoice payment void:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not void payment' });
    }
  });

  async function reverseSent(req, res, outcome) {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (!reason) return res.status(400).json({ error: 'A reason is required.' });
    try {
      const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const invoice = r.rows[0];
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) return res.status(404).json({ error: 'Invoice not found' });
      if (!['sent', 'overdue'].includes(invoice.status)) {
        return res.status(409).json({ error: ['partially_paid', 'paid'].includes(invoice.status)
          ? 'This invoice has payments. Void the payments in the bank Register first.'
          : invoice.status === 'written_off' ? 'This invoice was written off and cannot be reversed here.' : `This invoice cannot be ${outcome === 'void' ? 'voided' : 'reverted to draft'} from status ${invoice.status}.`, code: 'not_reversible' });
      }
      const pay = await pool.query(`SELECT 1 FROM org_invoice_payments WHERE invoice_id = $1 AND status = 'posted' LIMIT 1`, [invoiceId]);
      if (pay.rows.length) return res.status(409).json({ error: 'This invoice has payments. Void the payments in the bank Register first.', code: 'has_payments' });
      const cn = await pool.query(`SELECT 1 FROM org_invoice_credit_notes WHERE original_invoice_id = $1 AND org_id = $2 AND status = 'applied' LIMIT 1`, [invoiceId, orgId]);
      if (cn.rows.length) return res.status(409).json({ error: 'A customer credit note is applied to this invoice. Void the credit note first.', code: 'has_credit_note' });
      if (invoice.ledger_transaction_id) {
        const t = await pool.query('SELECT fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [invoice.ledger_transaction_id, orgId]);
        if (t.rows[0] && t.rows[0].status === 'posted') {
          if (await isFiscalYearLocked(pool, orgId, t.rows[0].fiscal_year)) {
            return res.status(409).json({ error: 'Fiscal year ' + t.rows[0].fiscal_year + ' is locked. Enter a customer credit note to correct this invoice.', code: 'fiscal_year_locked' });
          }
          const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: invoice.ledger_transaction_id, voidReason: `Invoice #${invoiceId} ${outcome === 'void' ? 'voided' : 'reverted to draft'}: ${reason}` });
          if (v.httpStatus >= 400) return res.status(v.httpStatus).json(v.body);
        }
      }
      await pool.query(
        `UPDATE org_invoices SET status = $1, ledger_transaction_id = CASE WHEN $1 = 'draft' THEN NULL ELSE ledger_transaction_id END, updated_at = NOW()
          WHERE id = $2 AND org_id = $3`, [outcome, invoiceId, orgId]);
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: outcome }], metadata: { ...reqMeta(req), reason } }).catch(() => {});
      return res.json({ id: invoiceId, status: outcome });
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice reverse:', e.message);
      return res.status(500).json({ error: 'Could not update the invoice' });
    }
  }

  app.post('/api/organizational/orgs/:slug/invoices/:id/revert-to-draft', ...orgAuth, financeWriter, (req, res) => reverseSent(req, res, 'draft'));

  app.post('/api/organizational/orgs/:slug/invoices/:id/email', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const invoice = r.rows[0];
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) return res.status(404).json({ error: 'Invoice not found' });
      if (!['sent', 'partially_paid', 'overdue', 'paid'].includes(invoice.status)) return res.status(409).json({ error: 'Only a sent invoice can be emailed.' });
      const newEmail = req.body && typeof req.body.customer_email === 'string' ? req.body.customer_email.trim() : '';
      if (newEmail && !EMAIL_RE.test(newEmail)) return res.status(400).json({ error: 'That email address is not valid.' });
      if (newEmail) await saveCustomerEmail(pool, { orgId, userId, req, constituentId: invoice.constituent_id, email: newEmail });
      const linesR = await pool.query(LINES_SELECT, [invoiceId]);
      const customerR = await pool.query('SELECT display_name, email FROM org_constituents WHERE id = $1', [invoice.constituent_id]);
      const totalCents = linesR.rows.reduce((t, l) => t + Math.round(Number(l.quantity) * Number(l.unit_amount_cents)), 0);
      const emailed = await sendInvoiceEmail(pool, { orgId, invoice, customerName: customerR.rows[0] && customerR.rows[0].display_name,
        customerEmail: customerR.rows[0] && customerR.rows[0].email, lines: linesR.rows, totalCents });
      return res.json({ id: invoiceId, emailed });
    } catch (e) {
      console.error('POST invoice email:', e.message);
      return res.status(500).json({ error: 'Could not email invoice' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/void', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('SELECT status FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (['sent', 'overdue'].includes(r.rows[0].status)) return reverseSent(req, res, 'void');
      if (r.rows[0].status !== 'draft') {
        return res.status(409).json({ error: r.rows[0].status === 'void' ? 'This invoice is already void.' : 'This invoice has payments or was written off. Void the payments in the bank Register first.', code: 'not_voidable' });
      }
      const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
      await pool.query(`UPDATE org_invoices SET status = 'void', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [invoiceId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: r.rows[0].status, newValue: 'void' }],
        metadata: reason ? { ...reqMeta(req), reason } : reqMeta(req),
      }).catch(() => {});
      return res.json({ id: invoiceId, status: 'void' });
    } catch (e) {
      console.error('POST invoice void:', e.message);
      return res.status(500).json({ error: 'Could not void invoice' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/write-off', ...orgAuth, financeWriter, async (req, res) => {
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const out = await runTool('invoice.write_off', ctxFromReq(pool, req), { ...(req.body || {}), id: invoiceId });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST invoice write-off:', e.message);
      return res.status(500).json({ error: 'Could not write off invoice' });
    }
  });
}

module.exports = { registerInvoicesRoutes };
