'use strict';

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction } = require('../lib/ledgerPosting');
const { recordInvoicePayment, voidInvoicePayment, invoiceRemainingBalanceCents } = require('../lib/billInvoicePayments');
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Own translator, same reasoning as bills.js's -- distinct error classes need distinct, accurately-flavored messages, not a shared handler that assumes a different table raised them. */
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
  };
}

function rowToInvoicePayment(row) {
  return {
    id: row.id, invoice_id: row.invoice_id,
    bank_account_id: row.bank_account_id, bank_account_code: row.bank_account_code, bank_account_name: row.bank_account_name,
    payment_date: row.payment_date, amount_cents: String(row.amount_cents), reference: row.reference,
    status: row.status, ledger_transaction_id: row.ledger_transaction_id,
    created_by: row.created_by, created_at: row.created_at,
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

  const LINES_SELECT = `
    SELECT l.id, l.invoice_id, l.account_id, a.code AS account_code, a.name AS account_name,
           l.program_id, p.name AS program_name, l.description, l.quantity, l.unit_amount_cents,
           l.fair_market_value_cents, l.line_memo
    FROM org_invoice_lines l
    JOIN org_accounts a ON a.id = l.account_id
    JOIN org_programs p ON p.id = l.program_id
    WHERE l.invoice_id = $1
    ORDER BY l.id ASC`;

  app.get('/api/organizational/orgs/:slug/invoices', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const status = req.query.status != null ? String(req.query.status) : null;
    const constituentId = req.query.constituent_id != null ? Number.parseInt(String(req.query.constituent_id), 10) : null;
    try {
      const conds = ['i.org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (status) { conds.push(`i.status = $${p}`); params.push(status); p += 1; }
      if (Number.isInteger(constituentId) && constituentId > 0) { conds.push(`i.constituent_id = $${p}`); params.push(constituentId); p += 1; }

      // org_invoices itself carries no program_id -- only org_invoice_lines does.
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

  /**
   * Invoice document OCR prefill (2026-09-17) -- header fields only (customer name, dates,
   * reference, total amount); never proposes account_id/program_id. See billInvoiceOcr.js.
   *
   * Registered BEFORE /invoices/:id -- same ordering reason as aging-report below.
   */
  app.post('/api/organizational/orgs/:slug/invoices/ocr-preview', ...orgAuth, upload.single('file'), async (req, res) => {
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

  /**
   * Customer coding-history suggestion (2026-09-17) -- mirrors bills.js's
   * vendor-coding-suggestion / Bank Reconciliation's coding-suggestion: look at the most
   * recent single-line invoice for this customer and offer its account/program back as a
   * prefill. Never applied automatically.
   */
  app.get('/api/organizational/orgs/:slug/invoices/customer-coding-suggestion', ...orgAuth, async (req, res) => {
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

  /**
   * AR aging report -- read-only, no new mechanism (spec 4.7), mirrors the AP one. Only
   * 'sent', 'partially_paid', and 'overdue' invoices carry a currently-owed receivable --
   * draft hasn't posted one, paid/void/written_off aren't currently owed. total_cents nets out
   * any posted org_invoice_payments -- a partially_paid invoice must show its remaining balance
   * here, not its original full total, or this report (and anything reading it, including the
   * Accounting Dashboard's AR bar chart) silently overstates what's actually still owed.
   *
   * Registered BEFORE /invoices/:id -- same Express route-ordering lesson as bills.js's aging
   * report: :id would otherwise greedily match the literal segment "aging-report".
   */
  app.get('/api/organizational/orgs/:slug/invoices/aging-report', ...orgAuth, async (req, res) => {
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

  app.get('/api/organizational/orgs/:slug/invoices/:id', ...orgAuth, async (req, res) => {
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

  app.post('/api/organizational/orgs/:slug/invoices', ...orgAuth, async (req, res) => {
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

  // Same relaxation as bills.js, mirrored for invoices -- invoices have no pending_approval
  // stage (draft -> sent directly), so full editing stays draft-only. Once sent (the
  // receivable posts in /send), lines/amount/customer need a customer credit note or
  // write-off instead (matches QBO/Xero practice) -- but due_date and reference never touch
  // org_ledger_lines, so locking them has no accounting justification. No
  // procurement_rationale here -- that's a bills-only, 2 CFR 200.320 concept.
  const INVOICE_FULL_EDIT_STATUSES = new Set(['draft']);
  const INVOICE_METADATA_ONLY_STATUSES = new Set(['sent', 'partially_paid', 'paid', 'overdue']);
  const INVOICE_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference']);

  app.patch('/api/organizational/orgs/:slug/invoices/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};

    // Pre-transaction lookup via pool.query (self-scoped per call), not a client checked out via
    // pool.connect() -- that client only gets its org GUC injected on ITS OWN first BEGIN.
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
          error: `Once sent, only due_date and reference can be edited directly -- ${disallowed.join(', ')} requires a customer credit note or write-off instead.`,
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

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE org_invoices SET constituent_id = $1, due_date = $2, reference = $3, updated_at = NOW() WHERE id = $4 AND org_id = $5`,
        [nextConstituentId, dueDate, nextReference, invoiceId, orgId]
      );
      if (parsedLines) await replaceLines(client, invoiceId, parsedLines);
      await client.query('COMMIT');

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

  /**
   * Draft -> Sent -- the receivable posts here. Debit Accounts Receivable for the invoice
   * total; credit each line's own account for its exchange-revenue amount. A line carrying
   * fair_market_value_cents (spec 4.3, quid-pro-quo) splits into two credit lines instead of
   * one: the FMV portion to the line's own account (earned revenue), the remainder to the org's
   * contribution-revenue account -- same multi-line transaction shape every other posting path
   * in this system already uses, no new mechanism.
   */
  app.post('/api/organizational/orgs/:slug/invoices/:id/send', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });

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
          ledgerLines.push({ account_id: l.account_id, program_id: l.program_id, debit_cents: 0, credit_cents: lineTotal, line_memo: l.description || l.line_memo });
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
  });

  app.get('/api/organizational/orgs/:slug/invoices/:id/payments', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT p.*, a.code AS bank_account_code, a.name AS bank_account_name
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

  /**
   * Invoices support partial payment (the schema's `partially_paid` status has been unused
   * until now) -- unlike bills, amount_cents is caller-supplied here and validated against the
   * remaining balance (total minus prior posted payments), not derived from the full total.
   */
  app.post('/api/organizational/orgs/:slug/invoices/:id/payments', ...orgAuth, async (req, res) => {
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
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      const translated = translateInvoiceWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST invoice payment:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment' });
    }
  });

  /**
   * Void a payment (typo'd amount/wrong account -- not "this invoice isn't collectible", that's
   * a write-off instead). Same two-path discipline as Bank Reconciliation's unreconcile: an open
   * fiscal year just voids the payment's own transaction; a locked one posts a mirror-image
   * reversing entry in the current period. Status is recomputed from whatever posted payments
   * remain, not assumed -- voiding one of several partial payments should fall back to
   * partially_paid or all the way to sent, not always jump straight to sent.
   */
  app.post('/api/organizational/orgs/:slug/invoices/:id/payments/:paymentId/void', ...orgAuth, async (req, res) => {
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
      const result = await voidInvoicePayment(pool, { orgId, userId, invoiceId, paymentId, reason });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST invoice payment void:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not void payment' });
    }
  });

  app.post('/api/organizational/orgs/:slug/invoices/:id/void', ...orgAuth, async (req, res) => {
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
      if (r.rows[0].status !== 'draft') {
        return res.status(409).json({ error: 'Only a draft invoice can be voided directly -- a sent invoice needs a customer credit note or write-off instead.', code: 'not_voidable' });
      }
      await pool.query(`UPDATE org_invoices SET status = 'void', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [invoiceId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: r.rows[0].status, newValue: 'void' }],
        metadata: reqMeta(req),
      }).catch(() => {});
      return res.json({ id: invoiceId, status: 'void' });
    } catch (e) {
      console.error('POST invoice void:', e.message);
      return res.status(500).json({ error: 'Could not void invoice' });
    }
  });

  /**
   * Write-off (spec 4.5) -- light, deliberate, manual. Posts an adjusting entry: credit the
   * receivable (Accounts Receivable), debit a bad-debt-expense account the caller specifies --
   * unlike AP/AR/contribution-revenue, which bad-debt-expense account to use is a real policy
   * choice orgs already have their own line item for, not a structural system account this
   * function should invent and lazily create. Writes off the remaining balance, not the
   * original line total -- an invoice can reach here from `partially_paid` (real cash already
   * received via org_invoice_payments), and writing off the full total would double-count that
   * payment as still outstanding (found live 2026-09-11, flagged as a known gap since rev 73).
   */
  app.post('/api/organizational/orgs/:slug/invoices/:id/write-off', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const invoiceId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(invoiceId) || invoiceId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    const badDebtAccountId = Number.parseInt(String(body.bad_debt_expense_account_id), 10);
    if (!Number.isInteger(badDebtAccountId) || badDebtAccountId < 1) {
      return res.status(400).json({ error: 'bad_debt_expense_account_id is required' });
    }

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
        transactionDate: new Date().toISOString().slice(0, 10),
        memo: `Write-off for invoice #${invoiceId}`,
        payee: null,
        referenceNumber: invoice.reference,
        lines: [
          { account_id: badDebtAccountId, program_id: programR.rows[0].program_id, debit_cents: remainingCents, credit_cents: 0, line_memo: `Bad debt write-off, invoice #${invoiceId}` },
          { account_id: arAccountR.rows[0].id, program_id: programR.rows[0].program_id, debit_cents: 0, credit_cents: remainingCents, line_memo: `Write-off, invoice #${invoiceId}` },
        ],
        source: 'invoice',
      });
      if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

      await pool.query(`UPDATE org_invoices SET status = 'written_off', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [invoiceId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId,
        fields: [{ fieldName: 'status', oldValue: invoice.status, newValue: 'written_off' }],
        metadata: { ...reqMeta(req), remaining_cents: remainingCents, bad_debt_expense_account_id: badDebtAccountId },
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
