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
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { translateInvoiceWriteError } = require('../lib/documentWriteErrors');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');
const { sendInvoiceEmail } = require('../lib/sendInvoiceEmail');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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

function parseInvoiceLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1) {
    return { error: 'lines must be an array of at least 1 entry' };
  }
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] || {};
    const rowNum = i + 1;
    const accountId = Number.parseInt(String(l.account_id), 10);
    const programId = Number.parseInt(String(l.program_id), 10);
    const unitAmountCents = Number.parseInt(String(l.unit_amount_cents), 10);
    const quantity = l.quantity != null ? Number(l.quantity) : 1;
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${rowNum}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `line ${rowNum}: program_id is required` };
    if (!Number.isInteger(unitAmountCents) || unitAmountCents <= 0) return { error: `line ${rowNum}: unit_amount_cents must be a positive integer` };
    if (!Number.isFinite(quantity) || quantity <= 0) return { error: `line ${rowNum}: quantity must be a positive number` };
    let fmvCents = null;
    if (l.fair_market_value_cents != null && l.fair_market_value_cents !== '') {
      fmvCents = Number.parseInt(String(l.fair_market_value_cents), 10);
      if (!Number.isInteger(fmvCents) || fmvCents < 0 || fmvCents > unitAmountCents) {
        return { error: `line ${rowNum}: fair_market_value_cents must be between 0 and unit_amount_cents` };
      }
    }
    parsed.push({
      accountId, programId, unitAmountCents, quantity, fmvCents,
      description: l.description != null ? String(l.description) : null,
      lineMemo: l.line_memo != null ? String(l.line_memo) : null,
    });
  }
  return { parsedLines: parsed };
}

async function invoiceLinePrograms(pool, invoiceId) {
  const r = await pool.query('SELECT program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
  return r.rows.map((row) => row.program_id);
}

async function replaceLines(client, invoiceId, parsedLines) {
  await client.query('DELETE FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
  for (const l of parsedLines) {
    await client.query(
      `INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, quantity, unit_amount_cents, fair_market_value_cents, line_memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [invoiceId, l.accountId, l.programId, l.description, l.quantity, l.unitAmountCents, l.fmvCents, l.lineMemo]
    );
  }
}

function registerInvoicesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  const LINES_SELECT = `
    SELECT l.id, l.invoice_id, l.account_id, a.code AS account_code, a.name AS account_name,
           l.program_id, p.name AS program_name, l.description, l.quantity, l.unit_amount_cents,
           l.fair_market_value_cents, l.line_memo
    FROM org_invoice_lines l
    JOIN org_accounts a ON a.id = l.account_id
    JOIN org_programs p ON p.id = l.program_id
    WHERE l.invoice_id = $1
    ORDER BY l.id ASC`;

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

  const INVOICE_FULL_EDIT_STATUSES = new Set(['draft']);
  const INVOICE_METADATA_ONLY_STATUSES = new Set(['sent', 'partially_paid', 'paid', 'overdue']);
  const INVOICE_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference', 'lines', 'reason']);

  app.patch('/api/organizational/orgs/:slug/invoices/:id', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};

    const existing = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = existing.rows[0];

    const existingLinePrograms = await invoiceLinePrograms(pool, invoiceId);
    if (existingLinePrograms.length === 0 && programScopeFor(req) !== null) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const isFullEdit = INVOICE_FULL_EDIT_STATUSES.has(invoice.status);
    const isMetadataOnly = INVOICE_METADATA_ONLY_STATUSES.has(invoice.status);
    if (!isFullEdit && !isMetadataOnly) {
      return res.status(409).json({ error: `Invoice cannot be edited in status ${invoice.status}`, code: 'not_editable' });
    }
    if (isMetadataOnly) {
      const requestedFields = Object.keys(body);
      const disallowed = requestedFields.filter((f) => !INVOICE_METADATA_ONLY_FIELDS.has(f));
      if (disallowed.length > 0) {
        return res.status(409).json({
          error: `Once sent, only the due date, reference and each line's account, program and description can be edited here. To change ${disallowed.join(', ')}, revert the invoice to draft or enter a customer credit note.`,
          code: 'requires_credit_note',
        });
      }
    }

    let parsedLines = null;
    if (isFullEdit && body.lines !== undefined) {
      const parsed = parseInvoiceLines(body.lines);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      parsedLines = parsed.parsedLines;
      if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
        return res.status(403).json({ error: 'You do not have access to set lines outside your granted program(s).' });
      }
    } else if (!headerProgramsInScope(req, existingLinePrograms)) {
      return res.status(403).json({ error: 'You do not have access to edit this invoice.' });
    }
    const dueDate = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : invoice.due_date;
    if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });

    const nextConstituentId = isFullEdit && body.constituent_id !== undefined
      ? Number.parseInt(String(body.constituent_id), 10) : invoice.constituent_id;
    const nextReference = body.reference !== undefined ? (body.reference ? String(body.reference) : null) : invoice.reference;
    const nextNumber = isFullEdit && body.invoice_number !== undefined ? (String(body.invoice_number || '').trim() || invoice.invoice_number) : invoice.invoice_number;

    let posted = null;
    if (isMetadataOnly && Array.isArray(body.lines) && body.lines.length) {
      const reason = body.reason != null ? String(body.reason).trim() : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required to change a sent invoice.', code: 'reason_required' });
      if (!invoice.ledger_transaction_id) return res.status(409).json({ error: 'This invoice has no ledger entry to update.', code: 'not_editable' });
      const tR = await pool.query('SELECT id, fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [invoice.ledger_transaction_id, orgId]);
      const txn = tR.rows[0];
      if (!txn || txn.status !== 'posted') return res.status(409).json({ error: 'This invoice\'s ledger entry is not posted, so it cannot be edited here.', code: 'not_editable' });
      if (await isFiscalYearLocked(pool, orgId, txn.fiscal_year)) {
        return res.status(409).json({ error: 'Fiscal year ' + txn.fiscal_year + ' is locked. Enter a customer credit note to correct this invoice.', code: 'fiscal_year_locked' });
      }
      const invLines = (await pool.query(LINES_SELECT, [invoiceId])).rows;
      if (invLines.some((l) => l.fair_market_value_cents != null)) {
        return res.status(409).json({ error: 'A line with a quid-pro-quo split cannot be edited here. Revert the invoice to draft to change it.', code: 'split_line' });
      }
      const ledgerRows = (await pool.query(
        `SELECT id, account_id, program_id, debit_cents, credit_cents, line_memo, source_line_type, source_line_id FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [txn.id])).rows;
      const linkedLedger = new Map(ledgerRows.filter((r) => r.source_line_type === 'org_invoice_lines').map((r) => [r.source_line_id, r]));
      const matches = ledgerRows.length === invLines.length + 1
        && invLines.every((il) => linkedLedger.has(il.id)
          && Number(linkedLedger.get(il.id).credit_cents) === Math.round(Number(il.quantity) * Number(il.unit_amount_cents)));
      if (!matches) return res.status(409).json({ error: 'This invoice\'s ledger entry no longer matches its lines (it was changed elsewhere), so it cannot be edited here safely.', code: 'ledger_mismatch' });

      const edits = [];
      for (const raw of body.lines) {
        const idx = invLines.findIndex((il) => il.id === Number.parseInt(String(raw && raw.id), 10));
        if (idx < 0) return res.status(400).json({ error: 'line ' + (raw && raw.id) + ' is not on this invoice' });
        const old = invLines[idx];
        if (raw.unit_amount_cents !== undefined && Number(raw.unit_amount_cents) !== Number(old.unit_amount_cents)) {
          return res.status(409).json({ error: 'Amounts cannot change after sending. Revert the invoice to draft or enter a customer credit note.', code: 'requires_credit_note' });
        }
        const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
        const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
        if (!(accountId > 0) || !(programId > 0)) return res.status(400).json({ error: 'account and program must be ids' });
        const description = raw.description !== undefined ? (raw.description == null ? null : String(raw.description).trim() || null) : old.description;
        edits.push({ idx, old, ledger: linkedLedger.get(old.id), accountId, programId, description });
      }
      const finalPrograms = invLines.map((il, i) => (edits.find((e) => e.idx === i) || { programId: il.program_id }).programId);
      if (!headerProgramsInScope(req, finalPrograms)) return res.status(403).json({ error: 'You do not have access to set lines outside your granted program(s).' });

      const idsOf = (k, k2) => [...new Set(edits.flatMap((e) => [e.old[k], e[k2]]).filter((v) => v != null))];
      const [aR, prR] = await Promise.all([
        pool.query(`SELECT id, code || ' ' || name AS label FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, idsOf('account_id', 'accountId')]),
        pool.query(`SELECT id, name AS label FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, idsOf('program_id', 'programId')]),
      ]);
      const lab = (r, id) => ((r.rows.find((x) => x.id === id) || {}).label || '#' + id);
      const fields = [];
      for (const e of edits) {
        const n = 'Line ' + (e.idx + 1) + ' ';
        if (e.accountId !== e.old.account_id) fields.push({ fieldName: n + 'account', oldValue: lab(aR, e.old.account_id), newValue: lab(aR, e.accountId) });
        if (e.programId !== e.old.program_id) fields.push({ fieldName: n + 'program', oldValue: lab(prR, e.old.program_id), newValue: lab(prR, e.programId) });
        if ((e.description || null) !== (e.old.description || null)) fields.push({ fieldName: n + 'description', oldValue: e.old.description || '(none)', newValue: e.description || '(none)' });
      }
      posted = { txn, edits, fields, reason, arLine: ledgerRows.find((r) => !r.source_line_type && Number(r.debit_cents) > 0), firstProgram: finalPrograms[0] };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE org_invoices SET constituent_id = $1, due_date = $2, reference = $3, invoice_number = $6, updated_at = NOW() WHERE id = $4 AND org_id = $5`,
        [nextConstituentId, dueDate, nextReference, invoiceId, orgId, nextNumber]
      );
      if (parsedLines) await replaceLines(client, invoiceId, parsedLines);
      if (posted) {
        for (const e of posted.edits) {
          await client.query('UPDATE org_invoice_lines SET account_id = $1, program_id = $2, description = $3 WHERE id = $4 AND invoice_id = $5',
            [e.accountId, e.programId, e.description, e.old.id, invoiceId]);
          const descChanged = (e.description || null) !== (e.old.description || null);
          await client.query('UPDATE org_ledger_lines SET account_id = $1, program_id = $2, line_memo = $3 WHERE id = $4 AND transaction_id = $5',
            [e.accountId, e.programId, descChanged ? (e.description || e.old.line_memo) : e.ledger.line_memo, e.ledger.id, posted.txn.id]);
        }
        const first = posted.edits.find((e) => e.idx === 0);
        if (first && first.programId !== first.old.program_id) {
          await client.query('UPDATE org_ledger_lines SET program_id = $1 WHERE id = $2 AND transaction_id = $3', [posted.firstProgram, posted.arLine.id, posted.txn.id]);
        }
      }
      await client.query('COMMIT');
      if (posted && posted.fields.length) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields: posted.fields, metadata: { ...reqMeta(req), reason: posted.reason } }).catch(() => {});
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: posted.txn.id, fields: posted.fields, metadata: { reason: posted.reason } }).catch(() => {});
      }

      if (isMetadataOnly) {
        const fields = diffFields(invoice, { due_date: dueDate, reference: nextReference }, ['due_date', 'reference']);
        if (fields.length > 0) {
          logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields, metadata: reqMeta(req) }).catch(() => {});
        }
      }

      return res.json({ id: invoiceId, status: invoice.status });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('PATCH invoice:', e.message);
      return res.status(500).json({ error: 'Could not update invoice' });
    } finally {
      client.release();
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
