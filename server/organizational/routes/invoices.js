'use strict';

const multer = require('multer');
const { displayCents } = require('../lib/voidedDisplay');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction, isFiscalYearLocked, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { acquireDocumentLock } = require('../lib/documentLock');
const { recordInvoicePayment, voidInvoicePayment, invoiceRemainingBalanceCents } = require('../lib/billInvoicePayments');
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function translateInvoiceWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA003') {
    return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'One of these lines references an account that is a rollup/header account, not a postable account.' } };
  }
  if (e.code === 'CA004') {
    return { status: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This invoice references an account, program, or constituent that belongs to a different organization, or a constituent that is not marked as a customer.' } };
  }
  if (e.code === '23514' || e.code === '23503') {
    return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  }
  return null;
}

function rowToInvoice(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    constituent_id: row.constituent_id,
    customer_name: row.customer_name || null,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    reference: row.reference,
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
      return res.json({ invoices: r.rows.map(rowToInvoice) });
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
                  - COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = i.id AND status = 'posted'), 0) AS total_cents,
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
        `SELECT i.*, c.display_name AS customer_name,
                COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0) AS total_cents
         FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
         WHERE i.id = $1 AND i.org_id = $2 LIMIT 1`,
        [invoiceId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const linesR = await pool.query(LINES_SELECT, [invoiceId]);
      if (linesR.rows.length === 0 && programScopeFor(req) !== null) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      return res.json({ invoice: rowToInvoice(r.rows[0]), lines: linesR.rows.map(rowToInvoiceLine) });
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
        `INSERT INTO org_invoices (org_id, constituent_id, invoice_date, due_date, reference, fiscal_year, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [orgId, constituentId, invoiceDate, dueDate, body.reference != null ? String(body.reference) : null, fiscalYear, userId]
      );
      const invoiceId = r.rows[0].id;
      await replaceLines(client, invoiceId, parsedLines);
      await client.query('COMMIT');
      logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_invoices', recordId: invoiceId, metadata: reqMeta(req) }).catch(() => {});
      return res.status(201).json({ id: invoiceId, status: 'draft' });
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

    let posted = null;
    if (isMetadataOnly && Array.isArray(body.lines) && body.lines.length) {
      const reason = body.reason != null ? String(body.reason).trim() : '';
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
        `UPDATE org_invoices SET constituent_id = $1, due_date = $2, reference = $3, updated_at = NOW() WHERE id = $4 AND org_id = $5`,
        [nextConstituentId, dueDate, nextReference, invoiceId, orgId]
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

  app.post('/api/organizational/orgs/:slug/invoices/:id/send', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });

    const docLock = await acquireDocumentLock(pool, 'invoice:' + invoiceId);
    try {
    try {
      const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const invoice = r.rows[0];
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (invoice.status !== 'draft') return res.status(409).json({ error: `Invoice is not in draft status (status: ${invoice.status})`, code: 'not_draft' });

      const linesR = await pool.query(LINES_SELECT, [invoiceId]);
      if (!linesR.rows.length) return res.status(400).json({ error: 'Invoice has no lines' });
      const customerR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [invoice.constituent_id]);
      const arAccountR = await pool.query('SELECT org_get_or_create_ar_account($1) AS id', [orgId]);
      const arAccountId = arAccountR.rows[0].id;

      let totalCents = 0;
      const ledgerLines = [];
      let contribAccountId = null;
      for (const l of linesR.rows) {
        const lineTotal = Math.round(Number(l.quantity) * Number(l.unit_amount_cents));
        totalCents += lineTotal;
        if (l.fair_market_value_cents != null) {
          const fmvTotal = Math.round(Number(l.quantity) * Number(l.fair_market_value_cents));
          const contribTotal = lineTotal - fmvTotal;
          if (fmvTotal > 0) {
            ledgerLines.push({ account_id: l.account_id, program_id: l.program_id, debit_cents: 0, credit_cents: fmvTotal, line_memo: l.description || l.line_memo });
          }
          if (contribTotal > 0) {
            if (contribAccountId == null) {
              const contribR = await pool.query('SELECT org_get_or_create_contribution_revenue_account($1) AS id', [orgId]);
              contribAccountId = contribR.rows[0].id;
            }
            ledgerLines.push({ account_id: contribAccountId, program_id: l.program_id, debit_cents: 0, credit_cents: contribTotal, line_memo: `Quid pro quo split -- contribution portion of: ${l.description || 'invoice line'}` });
          }
        } else {
          ledgerLines.push({ account_id: l.account_id, program_id: l.program_id, debit_cents: 0, credit_cents: lineTotal, line_memo: l.description || l.line_memo, source_line_type: 'org_invoice_lines', source_line_id: l.id });
        }
      }
      ledgerLines.unshift({ account_id: arAccountId, program_id: linesR.rows[0].program_id, debit_cents: totalCents, credit_cents: 0, line_memo: `AR for invoice #${invoiceId}` });

      const postResult = await postLedgerTransaction(pool, {
        orgId,
        userId,
        transactionDate: invoice.invoice_date,
        memo: `Invoice #${invoiceId}${invoice.reference ? ' (' + invoice.reference + ')' : ''}`,
        payee: customerR.rows[0] ? customerR.rows[0].display_name : null,
        referenceNumber: invoice.reference,
        lines: ledgerLines,
        source: 'invoice',
        constituentId: invoice.constituent_id,
      });
      if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

      await pool.query(
        `UPDATE org_invoices SET status = 'sent', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
        [postResult.body.id, invoiceId, orgId]
      );
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: 'sent' }],
        metadata: { ...reqMeta(req), ledger_transaction_id: postResult.body.id },
      }).catch(() => {});
      return res.json({ id: invoiceId, status: 'sent', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice send:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not send invoice' });
    }
    } finally { await docLock.release(); }
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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    const bankAccountId = Number.parseInt(String(body.bank_account_id), 10);
    const paymentDate = body.payment_date != null ? String(body.payment_date) : null;
    const amountCents = Number.parseInt(String(body.amount_cents), 10);
    if (!Number.isInteger(bankAccountId) || bankAccountId < 1) return res.status(400).json({ error: 'bank_account_id is required' });
    if (!paymentDate || !DATE_RE.test(paymentDate)) return res.status(400).json({ error: 'payment_date is required and must be YYYY-MM-DD' });
    if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount_cents must be a positive integer' });

    try {
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      const result = await recordInvoicePayment(pool, { orgId, userId, invoiceId, bankAccountId, paymentDate, amountCents, reference: body.reference || null });
      if (result.httpStatus < 400) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields: [{ fieldName: 'Payment recorded', oldValue: null, newValue: '$' + (amountCents / 100).toFixed(2) + ' on ' + paymentDate }], metadata: reqMeta(req) }).catch(() => {});
      }
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice payment:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/payments/:paymentId/void', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    const paymentId = Number.parseInt(String(req.params.paymentId), 10);
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (!Number.isInteger(invoiceId) || invoiceId < 1 || !Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    try {
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      const recon = await pool.query(
        `SELECT 1 FROM org_bank_statement_lines s JOIN org_invoice_payments p ON p.ledger_transaction_id = s.ledger_transaction_id
          WHERE s.org_id = $1 AND p.id = $2 LIMIT 1`, [orgId, paymentId]);
      if (recon.rows.length) return res.status(409).json({ error: 'This payment is reconciled to a bank line. Unreconcile it first.', code: 'reconciled' });
      const result = await voidInvoicePayment(pool, { orgId, userId, invoiceId, paymentId, reason });
      if (result.httpStatus < 400) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields: [{ fieldName: 'Payment voided', oldValue: null, newValue: 'payment #' + paymentId }], metadata: { ...reqMeta(req), reason } }).catch(() => {});
      }
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
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    const badDebtAccountId = Number.parseInt(String(body.bad_debt_expense_account_id), 10);
    if (!Number.isInteger(badDebtAccountId) || badDebtAccountId < 1) {
      return res.status(400).json({ error: 'bad_debt_expense_account_id is required' });
    }
    const reason = body.reason != null ? String(body.reason).trim() : '';
    if (!reason) return res.status(400).json({ error: 'A reason for the write-off is required.' });
    const writeOffDate = body.date != null && body.date !== '' ? String(body.date) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(writeOffDate)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });

    try {
      const r = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Invoice not found' });
      const invoice = r.rows[0];
      if (!headerProgramsInScope(req, await invoiceLinePrograms(pool, invoiceId))) {
        return res.status(404).json({ error: 'Invoice not found' });
      }
      if (!['sent', 'partially_paid', 'overdue'].includes(invoice.status)) {
        return res.status(409).json({ error: `Invoice cannot be written off from status ${invoice.status}`, code: 'not_writeoffable' });
      }
      const { remainingCents } = await invoiceRemainingBalanceCents(pool, invoiceId);
      if (remainingCents <= 0) return res.status(409).json({ error: 'Invoice has no remaining balance to write off', code: 'nothing_to_write_off' });
      const programR = await pool.query('SELECT MIN(program_id) AS program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId]);
      const arAccountR = await pool.query('SELECT org_get_or_create_ar_account($1) AS id', [orgId]);

      const postResult = await postLedgerTransaction(pool, {
        orgId,
        userId,
        transactionDate: writeOffDate,
        memo: `Write-off for invoice #${invoiceId}`,
        payee: null,
        constituentId: invoice.constituent_id,
        referenceNumber: invoice.reference,
        lines: [
          { account_id: badDebtAccountId, program_id: programR.rows[0].program_id, debit_cents: remainingCents, credit_cents: 0, line_memo: `Bad debt write-off, invoice #${invoiceId}: ${reason}` },
          { account_id: arAccountR.rows[0].id, program_id: programR.rows[0].program_id, debit_cents: 0, credit_cents: remainingCents, line_memo: `Write-off, invoice #${invoiceId}` },
        ],
        source: 'invoice',
      });
      if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

      await pool.query(`UPDATE org_invoices SET status = 'written_off', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [invoiceId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: 'written_off' }],
        metadata: { ...reqMeta(req), reason, remaining_cents: remainingCents, bad_debt_expense_account_id: badDebtAccountId, date: writeOffDate },
      }).catch(() => {});
      return res.json({ id: invoiceId, status: 'written_off', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice write-off:', e.message);
      return res.status(500).json({ error: 'Could not write off invoice' });
    }
  });
}

module.exports = { registerInvoicesRoutes, translateInvoiceWriteError };
