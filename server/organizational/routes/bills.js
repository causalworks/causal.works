'use strict';
const { addFileInfo } = require('../lib/recordFiles');

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction, isFiscalYearLocked, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { acquireDocumentLock } = require('../lib/documentLock');
const { runTool, ctxFromReq } = require('../tools');
const { billCreditSql, invoiceCreditSql } = require('../lib/billInvoicePayments');
const { displayCents } = require('../lib/voidedDisplay');
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { suggestBillCoding } = require('../lib/billLineSuggestions');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MICRO_PURCHASE_THRESHOLD_CENTS = 1500000;
const SIMPLIFIED_ACQUISITION_THRESHOLD_CENTS = 35000000;
const ADEQUATE_QUOTE_COUNT = 3;

function translateBillWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA003') {
    return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'One of these lines references an account that is a rollup/header account, not a postable account.' } };
  }
  if (e.code === '23505' && /number_unique/.test(String(e.constraint || e.message))) {
    return { status: 409, body: { error: 'That number is already used by another bill. Pick a different number.', code: 'duplicate_number' } };
  }
  if (e.code === 'CA004') {
    return { status: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This bill references an account, program, grant, or vendor that belongs to a different organization, or a constituent that is not marked as a vendor.' } };
  }
  if (e.code === 'CA008') {
    return { status: 422, body: { error: e.message, code: 'self_approval_not_allowed', message: 'This bill touches a federal-award grant and needs sign-off from a different user than whoever created it.' } };
  }
  if (e.code === '23514' || e.code === '23503') {
    return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  }
  return null;
}

function rowToBill(row) {
  return {
    id: row.id,
    org_id: row.org_id,
    constituent_id: row.constituent_id,
    vendor_name: row.vendor_name || null,
    bill_date: row.bill_date,
    due_date: row.due_date,
    reference: row.reference,
    bill_number: row.bill_number || null,
    status: row.status,
    scheduled_payment_date: row.scheduled_payment_date || null,
    approved_by: row.approved_by,
    approved_at: row.approved_at,
    procurement_rationale: row.procurement_rationale,
    ledger_transaction_id: row.ledger_transaction_id,
    fiscal_year: row.fiscal_year,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    total_cents: row.total_cents != null ? String(row.total_cents) : undefined,
    display_total_cents: row.total_cents != null ? String(displayCents(row.status, row.total_cents)) : undefined,
  };
}

function rowToBillPayment(row) {
  return {
    id: row.id, bill_id: row.bill_id,
    bank_account_id: row.bank_account_id, bank_account_code: row.bank_account_code, bank_account_name: row.bank_account_name,
    payment_date: row.payment_date, amount_cents: String(row.amount_cents), reference: row.reference,
    status: row.status, ledger_transaction_id: row.ledger_transaction_id,
    created_by: row.created_by, created_at: row.created_at,
    statement_line_id: row.statement_line_id || null,
  };
}

function rowToBillLine(row) {
  return {
    id: row.id,
    bill_id: row.bill_id,
    account_id: row.account_id,
    account_code: row.account_code,
    account_name: row.account_name,
    program_id: row.program_id,
    program_name: row.program_name,
    grant_id: row.grant_id,
    grant_name: row.grant_name,
    amount_cents: String(row.amount_cents),
    is_1099_reportable: row.is_1099_reportable,
    line_memo: row.line_memo,
  };
}

function parseBillLines(lines) {
  if (!Array.isArray(lines) || lines.length < 1) {
    return { error: 'lines must be an array of at least 1 entry' };
  }
  const parsed = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] || {};
    const rowNum = i + 1;
    const accountId = Number.parseInt(String(l.account_id), 10);
    const programId = Number.parseInt(String(l.program_id), 10);
    const amountCents = Number.parseInt(String(l.amount_cents), 10);
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${rowNum}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `line ${rowNum}: program_id is required` };
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: `line ${rowNum}: amount_cents must be a positive integer` };
    let grantId = null;
    if (l.grant_id != null && l.grant_id !== '') {
      grantId = Number.parseInt(String(l.grant_id), 10);
      if (!Number.isInteger(grantId) || grantId < 1) return { error: `line ${rowNum}: grant_id must be a positive integer if provided` };
    }
    parsed.push({
      accountId, programId, grantId, amountCents,
      is1099Reportable: l.is_1099_reportable != null ? Boolean(l.is_1099_reportable) : null,
      lineMemo: l.line_memo != null ? String(l.line_memo) : null,
    });
  }
  return { parsedLines: parsed };
}

async function billLinePrograms(pool, billId) {
  const r = await pool.query('SELECT program_id FROM org_bill_lines WHERE bill_id = $1', [billId]);
  return r.rows.map((row) => row.program_id);
}

async function replaceLines(client, billId, parsedLines) {
  await client.query('DELETE FROM org_bill_lines WHERE bill_id = $1', [billId]);
  for (const l of parsedLines) {
    await client.query(
      `INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents, is_1099_reportable, line_memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [billId, l.accountId, l.programId, l.grantId, l.amountCents, l.is1099Reportable, l.lineMemo]
    );
  }
}

function registerBillsRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  const LINES_SELECT = `
    SELECT l.id, l.bill_id, l.account_id, a.code AS account_code, a.name AS account_name,
           l.program_id, p.name AS program_name, l.grant_id, g.name AS grant_name,
           l.amount_cents, l.is_1099_reportable, l.line_memo
    FROM org_bill_lines l
    JOIN org_accounts a ON a.id = l.account_id
    JOIN org_programs p ON p.id = l.program_id
    LEFT JOIN org_grants g ON g.id = l.grant_id
    WHERE l.bill_id = $1
    ORDER BY l.id ASC`;

  app.get('/api/organizational/orgs/:slug/bills', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const status = req.query.status != null ? String(req.query.status) : null;
    const constituentId = req.query.constituent_id != null ? Number.parseInt(String(req.query.constituent_id), 10) : null;
    try {
      const conds = ['b.org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (status) { conds.push(`b.status = $${p}`); params.push(status); p += 1; }
      if (Number.isInteger(constituentId) && constituentId > 0) { conds.push(`b.constituent_id = $${p}`); params.push(constituentId); p += 1; }

      const scopeClause = appendProgramScopeExistsClause(req, { linesTable: 'org_bill_lines', fkColumn: 'bill_id', parentIdExpr: 'b.id' }, params);

      const r = await pool.query(
        `SELECT b.*, c.display_name AS vendor_name,
                COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0) AS total_cents
         FROM org_bills b
         JOIN org_constituents c ON c.id = b.constituent_id
         WHERE ${conds.join(' AND ')}${scopeClause}
         ORDER BY b.bill_date DESC, b.id DESC
         LIMIT 500`,
        params
      );
      const bills = r.rows.map(rowToBill);
      await addFileInfo(pool, orgId, bills, 'bill');
      return res.json({ bills });
    } catch (e) {
      console.error('GET bills:', e.message);
      return res.status(500).json({ error: 'Could not load bills' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/ocr-preview', ...orgAuth, financeWriter, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    try {
      const { extracted, error } = await extractBillOrInvoiceFields(req.file.buffer, req.file.mimetype, 'bill');
      if (error) return res.status(422).json({ error });
      let vendorId = null;
      if (extracted.counterparty_name) {
        const v = await pool.query(
          `SELECT c.id FROM org_constituents c
            WHERE c.org_id = $1 AND lower(c.display_name) = lower($2)
              AND EXISTS (SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = c.id AND r.role = 'vendor' AND (r.ends_on IS NULL OR r.ends_on >= CURRENT_DATE))
            LIMIT 1`,
          [req.orgId, extracted.counterparty_name]);
        vendorId = v.rows.length ? v.rows[0].id : null;
      }
      const lines = extracted.lines && extracted.lines.length
        ? extracted.lines
        : (extracted.total_amount_cents ? [{ description: extracted.suggested_description || '', amount_cents: extracted.total_amount_cents }] : []);
      const suggestions = lines.length ? await suggestBillCoding(pool, req.orgId, vendorId, lines.map((l) => l.description)) : [];
      extracted.lines = lines.map((l, i) => ({ ...l, suggestion: suggestions[i] || null }));
      return res.json({ extracted });
    } catch (e) {
      console.error('POST bills/ocr-preview:', e.message);
      return res.status(500).json({ error: 'Could not scan this document' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bills/vendor-coding-suggestion', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const constituentId = Number.parseInt(String(req.query.constituent_id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id is required' });
    try {
      const r = await pool.query(
        `SELECT l.account_id, a.code AS account_code, a.name AS account_name, l.program_id, p.name AS program_name
         FROM org_bills b
         JOIN (SELECT bill_id, COUNT(*) AS line_count FROM org_bill_lines GROUP BY bill_id) lc ON lc.bill_id = b.id AND lc.line_count = 1
         JOIN org_bill_lines l ON l.bill_id = b.id
         JOIN org_accounts a ON a.id = l.account_id
         JOIN org_programs p ON p.id = l.program_id
         WHERE b.org_id = $1 AND b.constituent_id = $2
         ORDER BY b.bill_date DESC, b.id DESC
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
      console.error('GET bills/vendor-coding-suggestion:', e.message);
      return res.status(500).json({ error: 'Could not load coding suggestion' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bills/aging-report', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT b.id, b.reference, b.bill_date, b.due_date, c.display_name AS vendor_name,
                COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0)
                  - COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = b.id AND status = 'posted'), 0) - ${billCreditSql('b')} AS total_cents,
                (CURRENT_DATE - COALESCE(b.due_date, b.bill_date)) AS days_past_due
         FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
         WHERE b.org_id = $1 AND b.status IN ('approved', 'scheduled', 'partially_paid')
         ORDER BY days_past_due DESC`,
        [orgId]
      );
      const buckets = { current: [], '1_30': [], '31_60': [], '61_90': [], '90_plus': [] };
      const totals = { current: 0, '1_30': 0, '31_60': 0, '61_90': 0, '90_plus': 0 };
      for (const row of r.rows) {
        const days = Number(row.days_past_due);
        const key = days <= 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : '90_plus';
        const entry = { id: row.id, reference: row.reference, vendor_name: row.vendor_name, bill_date: row.bill_date, due_date: row.due_date, total_cents: String(row.total_cents), days_past_due: days };
        buckets[key].push(entry);
        totals[key] += Number(row.total_cents);
      }
      return res.json({ buckets, totals });
    } catch (e) {
      console.error('GET bills/aging-report:', e.message);
      return res.status(500).json({ error: 'Could not load AP aging report' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bills/:id', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT b.*, c.display_name AS vendor_name, c.email AS contact_email, c.phone AS contact_phone, c.mailing_address AS contact_address,
                COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0) AS total_cents,
                ${billCreditSql('b')} AS credited_cents
         FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
         WHERE b.id = $1 AND b.org_id = $2 LIMIT 1`,
        [billId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      const linesR = await pool.query(LINES_SELECT, [billId]);
      if (linesR.rows.length === 0 && programScopeFor(req) !== null) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      return res.json({ bill: { ...rowToBill(r.rows[0]), credited_cents: String(r.rows[0].credited_cents), contact_email: r.rows[0].contact_email || null, contact_phone: r.rows[0].contact_phone || null, contact_address: r.rows[0].contact_address || null }, lines: linesR.rows.map(rowToBillLine) });
    } catch (e) {
      console.error('GET bill detail:', e.message);
      return res.status(500).json({ error: 'Could not load bill' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};

    const constituentId = Number.parseInt(String(body.constituent_id), 10);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id is required' });
    const billDate = body.bill_date != null ? String(body.bill_date) : null;
    if (!billDate || !DATE_RE.test(billDate)) return res.status(400).json({ error: 'bill_date is required and must be YYYY-MM-DD' });
    const dueDate = body.due_date != null ? String(body.due_date) : null;
    if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });

    const { error, parsedLines } = parseBillLines(body.lines);
    if (error) return res.status(400).json({ error });
    if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
      return res.status(403).json({ error: 'You do not have access to create a bill with lines outside your granted program(s).' });
    }

    let fiscalYear;
    try {
      const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
      fiscalYear = fiscalYearForDate(billDate, fyEndMonth);
    } catch (e) {
      console.error('POST bills (fiscal year resolve):', e.message);
      return res.status(500).json({ error: 'Could not resolve fiscal year for this bill date' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const r = await client.query(
        `INSERT INTO org_bills (org_id, bill_number, constituent_id, bill_date, due_date, reference, fiscal_year, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, bill_number`,
        [orgId, String(body.bill_number || '').trim() || null, constituentId, billDate, dueDate, body.reference != null ? String(body.reference) : null, fiscalYear, userId]
      );
      const billId = r.rows[0].id;
      await replaceLines(client, billId, parsedLines);
      await client.query('COMMIT');
      logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_bills', recordId: billId, metadata: reqMeta(req) }).catch(() => {});
      return res.status(201).json({ id: billId, status: 'draft', bill_number: r.rows[0].bill_number });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bills:', e.message);
      return res.status(500).json({ error: 'Could not create bill' });
    } finally {
      client.release();
    }
  });

  const BILL_FULL_EDIT_STATUSES = new Set(['draft', 'pending_approval']);
  const BILL_METADATA_ONLY_STATUSES = new Set(['approved', 'scheduled', 'partially_paid', 'paid']);
  const BILL_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference', 'procurement_rationale', 'lines', 'reason']);

  app.patch('/api/organizational/orgs/:slug/bills/:id', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};

    const existing = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const bill = existing.rows[0];

    const existingLinePrograms = (await pool.query('SELECT program_id FROM org_bill_lines WHERE bill_id = $1', [billId])).rows.map((r) => r.program_id);
    if (existingLinePrograms.length === 0 && programScopeFor(req) !== null) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const isFullEdit = BILL_FULL_EDIT_STATUSES.has(bill.status);
    const isMetadataOnly = BILL_METADATA_ONLY_STATUSES.has(bill.status);
    if (!isFullEdit && !isMetadataOnly) {
      return res.status(409).json({ error: `Bill cannot be edited in status ${bill.status}`, code: 'not_editable' });
    }
    if (isMetadataOnly) {
      const requestedFields = Object.keys(body);
      const disallowed = requestedFields.filter((f) => !BILL_METADATA_ONLY_FIELDS.has(f));
      if (disallowed.length > 0) {
        return res.status(409).json({
          error: `Once approved, only the due date, reference, procurement rationale and each line's account, program, grant and description can be edited here. To change ${disallowed.join(', ')}, enter a vendor credit note.`,
          code: 'requires_credit_note',
        });
      }
    }

    let parsedLines = null;
    if (isFullEdit && body.lines !== undefined) {
      const parsed = parseBillLines(body.lines);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      parsedLines = parsed.parsedLines;
      if (!headerProgramsInScope(req, parsedLines.map((l) => l.programId))) {
        return res.status(403).json({ error: 'You do not have access to set lines outside your granted program(s).' });
      }
    } else if (!headerProgramsInScope(req, existingLinePrograms)) {
      return res.status(403).json({ error: 'You do not have access to edit this bill.' });
    }

    const dueDate = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : bill.due_date;
    if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });

    const nextConstituentId = isFullEdit && body.constituent_id !== undefined
      ? Number.parseInt(String(body.constituent_id), 10) : bill.constituent_id;
    const nextReference = body.reference !== undefined ? (body.reference ? String(body.reference) : null) : bill.reference;
    const nextNumber = isFullEdit && body.bill_number !== undefined ? (String(body.bill_number || '').trim() || bill.bill_number) : bill.bill_number;
    const nextRationale = body.procurement_rationale !== undefined ? (body.procurement_rationale ? String(body.procurement_rationale) : null) : bill.procurement_rationale;

    let posted = null;
    if (isMetadataOnly && Array.isArray(body.lines) && body.lines.length) {
      const reason = body.reason != null ? String(body.reason).trim() : '';
      if (!reason) return res.status(400).json({ error: 'A reason is required to change an approved bill.', code: 'reason_required' });
      if (!bill.ledger_transaction_id) return res.status(409).json({ error: 'This bill has no ledger entry to update.', code: 'not_editable' });
      const tR = await pool.query('SELECT id, fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [bill.ledger_transaction_id, orgId]);
      const txn = tR.rows[0];
      if (!txn || txn.status !== 'posted') return res.status(409).json({ error: 'This bill\'s ledger entry is not posted, so it cannot be edited here.', code: 'not_editable' });
      if (await isFiscalYearLocked(pool, orgId, txn.fiscal_year)) {
        return res.status(409).json({ error: 'Fiscal year ' + txn.fiscal_year + ' is locked. Enter a vendor credit note to correct this bill.', code: 'fiscal_year_locked' });
      }
      const billLines = (await pool.query(LINES_SELECT, [billId])).rows;
      const ledgerRows = (await pool.query(
        `SELECT id, account_id, program_id, grant_id, debit_cents, credit_cents, line_memo, donor_restriction_class::text AS restriction, source_line_type, source_line_id
           FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [txn.id])).rows;
      const linkedLedger = new Map(ledgerRows.filter((r) => r.source_line_type === 'org_bill_lines').map((r) => [r.source_line_id, r]));
      const apRow = ledgerRows.find((r) => !r.source_line_type && Number(r.credit_cents) > 0);
      const matches = !!apRow && ledgerRows.length === billLines.length + 1
        && billLines.every((bl) => linkedLedger.has(bl.id) && Number(linkedLedger.get(bl.id).debit_cents) === Number(bl.amount_cents));
      if (!matches) return res.status(409).json({ error: 'This bill\'s ledger entry no longer matches its lines (it was changed elsewhere), so it cannot be edited here safely.', code: 'ledger_mismatch' });

      const edits = [];
      for (const raw of body.lines) {
        const idx = billLines.findIndex((bl) => bl.id === Number.parseInt(String(raw && raw.id), 10));
        if (idx < 0) return res.status(400).json({ error: 'line ' + (raw && raw.id) + ' is not on this bill' });
        const old = billLines[idx];
        if (raw.amount_cents !== undefined && Number(raw.amount_cents) !== Number(old.amount_cents)) {
          return res.status(409).json({ error: 'Amounts cannot change after approval. Enter a vendor credit note.', code: 'requires_credit_note' });
        }
        const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
        const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
        const grantId = raw.grant_id !== undefined ? (raw.grant_id == null || raw.grant_id === '' ? null : Number.parseInt(String(raw.grant_id), 10)) : old.grant_id;
        if (!(accountId > 0) || !(programId > 0) || (grantId != null && !(grantId > 0))) return res.status(400).json({ error: 'account, program and grant must be ids' });
        const lineMemo = raw.line_memo !== undefined ? (raw.line_memo == null ? null : String(raw.line_memo).trim() || null) : old.line_memo;
        edits.push({ idx, old, ledger: linkedLedger.get(old.id), accountId, programId, grantId, lineMemo, grantChanged: grantId !== old.grant_id });
      }
      const finalPrograms = billLines.map((bl, i) => (edits.find((e) => e.idx === i) || { programId: bl.program_id }).programId);
      if (!headerProgramsInScope(req, finalPrograms)) return res.status(403).json({ error: 'You do not have access to set lines outside your granted program(s).' });

      const newGrantIds = [...new Set(edits.filter((e) => e.grantChanged && e.grantId != null).map((e) => e.grantId))];
      const grantById = new Map();
      if (newGrantIds.length) {
        const gR = await pool.query('SELECT id, is_federal_award, donor_restriction_class::text AS donor_restriction_class FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])', [orgId, newGrantIds]);
        gR.rows.forEach((g) => grantById.set(g.id, g));
        for (const e of edits) {
          if (!e.grantChanged || e.grantId == null) continue;
          const g = grantById.get(e.grantId);
          if (!g) return res.status(422).json({ error: 'That grant was not found.', code: 'cross_org_reference' });
          if (g.is_federal_award) return res.status(422).json({ error: 'A federal-award grant needs sign-off from a second person. Enter a vendor credit note and a corrected bill.', code: 'federal_award_needs_new_entry' });
        }
      }
      const idsOf = (k) => [...new Set(edits.flatMap((e) => [e.old[k], e[k === 'account_id' ? 'accountId' : k === 'program_id' ? 'programId' : 'grantId']]).filter((v) => v != null))];
      const [aR, prR, grR] = await Promise.all([
        pool.query(`SELECT id, code || ' ' || name AS label FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, idsOf('account_id')]),
        pool.query(`SELECT id, name AS label FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, idsOf('program_id')]),
        pool.query(`SELECT id, name AS label FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, idsOf('grant_id')]),
      ]);
      const lab = (r, id) => (id == null ? '(none)' : ((r.rows.find((x) => x.id === id) || {}).label || '#' + id));
      const fields = [];
      for (const e of edits) {
        const n = 'Line ' + (e.idx + 1) + ' ';
        if (e.accountId !== e.old.account_id) fields.push({ fieldName: n + 'account', oldValue: lab(aR, e.old.account_id), newValue: lab(aR, e.accountId) });
        if (e.programId !== e.old.program_id) fields.push({ fieldName: n + 'program', oldValue: lab(prR, e.old.program_id), newValue: lab(prR, e.programId) });
        if (e.grantId !== e.old.grant_id) fields.push({ fieldName: n + 'grant', oldValue: lab(grR, e.old.grant_id), newValue: lab(grR, e.grantId) });
        if ((e.lineMemo || null) !== (e.old.line_memo || null)) fields.push({ fieldName: n + 'description', oldValue: e.old.line_memo || '(none)', newValue: e.lineMemo || '(none)' });
      }
      posted = { txn, edits, fields, reason, apLine: apRow, firstProgram: finalPrograms[0], grantById };
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE org_bills SET
           constituent_id = $1, due_date = $2, reference = $3, procurement_rationale = $4, bill_number = $7, updated_at = NOW()
         WHERE id = $5 AND org_id = $6`,
        [nextConstituentId, dueDate, nextReference, nextRationale, billId, orgId, nextNumber]
      );
      if (parsedLines) await replaceLines(client, billId, parsedLines);
      if (posted) {
        for (const e of posted.edits) {
          await client.query('UPDATE org_bill_lines SET account_id = $1, program_id = $2, grant_id = $3, line_memo = $4 WHERE id = $5 AND bill_id = $6',
            [e.accountId, e.programId, e.grantId, e.lineMemo, e.old.id, billId]);
          const g = e.grantChanged && e.grantId != null ? posted.grantById.get(e.grantId) : null;
          const restriction = g && g.donor_restriction_class ? g.donor_restriction_class : e.ledger.restriction;
          await client.query('UPDATE org_ledger_lines SET account_id = $1, program_id = $2, grant_id = $3, donor_restriction_class = $4::org_restriction_class, line_memo = $5 WHERE id = $6 AND transaction_id = $7',
            [e.accountId, e.programId, e.grantId, restriction || null, (e.lineMemo || null) !== (e.old.line_memo || null) ? e.lineMemo : e.ledger.line_memo, e.ledger.id, posted.txn.id]);
        }
        const first = posted.edits.find((e) => e.idx === 0);
        if (first && first.programId !== first.old.program_id) {
          await client.query('UPDATE org_ledger_lines SET program_id = $1 WHERE id = $2 AND transaction_id = $3', [posted.firstProgram, posted.apLine.id, posted.txn.id]);
        }
      }
      await client.query('COMMIT');
      if (posted && posted.fields.length) {
        const meta = { ...reqMeta(req), reason: posted.reason };
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields: posted.fields, metadata: meta }).catch(() => {});
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: posted.txn.id, fields: posted.fields, metadata: { reason: posted.reason } }).catch(() => {});
      }

      if (isMetadataOnly) {
        const fields = diffFields(bill, { due_date: dueDate, reference: nextReference, procurement_rationale: nextRationale }, ['due_date', 'reference', 'procurement_rationale']);
        if (fields.length > 0) {
          logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields, metadata: reqMeta(req) }).catch(() => {});
        }
      }

      return res.json({ id: billId, status: bill.status });
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('PATCH bill:', e.message);
      return res.status(500).json({ error: 'Could not update bill' });
    } finally {
      client.release();
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/submit', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      const bill = r.rows[0];
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      if (bill.status !== 'draft') return res.status(409).json({ error: `Bill is not in draft status (status: ${bill.status})`, code: 'not_draft' });

      const totals = await pool.query(
        `SELECT COALESCE(SUM(l.amount_cents), 0)::bigint AS total_cents,
                bool_or(g.is_federal_award) AS touches_federal_award
         FROM org_bill_lines l LEFT JOIN org_grants g ON g.id = l.grant_id
         WHERE l.bill_id = $1`,
        [billId]
      );
      const { total_cents: totalCents, touches_federal_award: touchesFederal } = totals.rows[0];
      if (Number(totalCents) === 0) return res.status(400).json({ error: 'Bill has no lines' });

      if (touchesFederal && Number(totalCents) >= MICRO_PURCHASE_THRESHOLD_CENTS) {
        if (!bill.procurement_rationale) {
          return res.status(422).json({
            error: 'This bill touches a federal-award grant and crosses the micro-purchase threshold ($15,000) -- a procurement_rationale is required before it can be submitted.',
            code: 'procurement_rationale_required',
          });
        }

        const docCounts = await pool.query(
          `SELECT category, COUNT(*)::int AS n FROM org_documents
           WHERE org_id = $1 AND source_ref_type = 'bill' AND source_ref_id = $2
             AND category IN ('procurement_quote', 'procurement_solicitation') AND archived_at IS NULL
           GROUP BY category`,
          [orgId, billId]
        );
        const quoteCount = docCounts.rows.find(r => r.category === 'procurement_quote')?.n || 0;
        const solicitationCount = docCounts.rows.find(r => r.category === 'procurement_solicitation')?.n || 0;

        if (Number(totalCents) >= SIMPLIFIED_ACQUISITION_THRESHOLD_CENTS) {
          if (solicitationCount === 0 && quoteCount < ADEQUATE_QUOTE_COUNT) {
            return res.status(422).json({
              error: `This bill touches a federal-award grant and is at or above the simplified acquisition threshold ($350,000) -- attach either a formal sealed-bid/competitive-proposal solicitation package, or at least ${ADEQUATE_QUOTE_COUNT} price quotes from qualified sources, before it can be submitted.`,
              code: 'procurement_solicitation_required',
            });
          }
        } else if (quoteCount === 0) {
          return res.status(422).json({
            error: 'This bill touches a federal-award grant and crosses the micro-purchase threshold ($15,000) -- at least one attached quote/price document is required before it can be submitted.',
            code: 'procurement_quote_required',
          });
        }
      }

      await pool.query(`UPDATE org_bills SET status = 'pending_approval', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [billId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
        fields: [{ fieldName: 'status', oldValue: bill.status, newValue: 'pending_approval' }],
        metadata: reqMeta(req),
      }).catch(() => {});
      return res.json({ id: billId, status: 'pending_approval' });
    } catch (e) {
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bill submit:', e.message);
      return res.status(500).json({ error: 'Could not submit bill' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/approve', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });

    const docLock = await acquireDocumentLock(pool, 'bill:' + billId);
    try {
    try {
      const r = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      const bill = r.rows[0];
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      if (bill.status !== 'pending_approval') {
        return res.status(409).json({ error: `Bill is not awaiting approval (status: ${bill.status})`, code: 'not_pending_approval' });
      }

      if (!bill.bill_number) {
        bill.bill_number = (await pool.query(
          `UPDATE org_bills SET bill_number = org_take_document_number($2, 'bill') WHERE id = $1 AND org_id = $2 AND bill_number IS NULL RETURNING bill_number`, [billId, orgId])).rows[0].bill_number;
      }

      const approveR = await pool.query(
        `UPDATE org_bills SET approved_by = $1, approved_at = NOW(), updated_at = NOW()
         WHERE id = $2 AND org_id = $3 RETURNING approved_at`,
        [userId, billId, orgId]
      );
      const approvedAt = approveR.rows[0].approved_at;

      const linesR = await pool.query(LINES_SELECT, [billId]);
      const vendorR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [bill.constituent_id]);
      const apAccountR = await pool.query('SELECT org_get_or_create_ap_account($1) AS id', [orgId]);
      const apAccountId = apAccountR.rows[0].id;
      const totalCents = linesR.rows.reduce((s, l) => s + Number(l.amount_cents), 0);

      const ledgerLines = linesR.rows.map((l) => ({
        account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
        debit_cents: Number(l.amount_cents), credit_cents: 0,
        line_memo: l.line_memo, source_line_type: 'org_bill_lines', source_line_id: l.id,
      }));
      ledgerLines.push({
        account_id: apAccountId, program_id: linesR.rows[0].program_id, grant_id: null,
        debit_cents: 0, credit_cents: totalCents,
        line_memo: `AP liability for bill #${billId}`,
      });

      const postResult = await postLedgerTransaction(pool, {
        orgId,
        userId,
        transactionDate: bill.bill_date,
        memo: `Bill ${bill.bill_number || '#' + billId}${bill.reference ? ' (' + bill.reference + ')' : ''}`,
        payee: vendorR.rows[0] ? vendorR.rows[0].display_name : null,
        referenceNumber: bill.reference,
        lines: ledgerLines,
        source: 'bill_approval',
        constituentId: bill.constituent_id,
        internalApproval: { approvedBy: userId, approvedAt, sourceRefId: billId, sourceRefType: 'bill' },
      });
      if (postResult.httpStatus >= 400) {
        await pool.query(`UPDATE org_bills SET approved_by = NULL, approved_at = NULL WHERE id = $1 AND org_id = $2`, [billId, orgId]);
        return res.status(postResult.httpStatus).json(postResult.body);
      }

      await pool.query(
        `UPDATE org_bills SET status = 'approved', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
        [postResult.body.id, billId, orgId]
      );
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
        fields: [{ fieldName: 'status', oldValue: bill.status, newValue: 'approved' }],
        metadata: { ...reqMeta(req), ledger_transaction_id: postResult.body.id },
      }).catch(() => {});
      return res.json({ id: billId, status: 'approved', ledger_transaction_id: postResult.body.id });
    } catch (e) {
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bill approve:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not approve bill' });
    }
    } finally { await docLock.release(); }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/schedule', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    const scheduledPaymentDate = req.body && req.body.scheduled_payment_date != null ? String(req.body.scheduled_payment_date) : null;
    if (!scheduledPaymentDate || !DATE_RE.test(scheduledPaymentDate)) {
      return res.status(400).json({ error: 'scheduled_payment_date is required and must be YYYY-MM-DD' });
    }
    try {
      const r = await pool.query('SELECT status FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      if (r.rows[0].status !== 'approved') {
        return res.status(409).json({ error: `Only an approved bill can be scheduled (status: ${r.rows[0].status})`, code: 'not_approved' });
      }
      await pool.query(
        `UPDATE org_bills SET status = 'scheduled', scheduled_payment_date = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`,
        [scheduledPaymentDate, billId, orgId]
      );
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields: [{ fieldName: 'status', oldValue: 'approved', newValue: 'scheduled for ' + scheduledPaymentDate }], metadata: reqMeta(req) }).catch(() => {});
      return res.json({ id: billId, status: 'scheduled', scheduled_payment_date: scheduledPaymentDate });
    } catch (e) {
      console.error('POST bill schedule:', e.message);
      return res.status(500).json({ error: 'Could not schedule bill' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/unschedule', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('SELECT status FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      if (r.rows[0].status !== 'scheduled') {
        return res.status(409).json({ error: `Bill is not scheduled (status: ${r.rows[0].status})`, code: 'not_scheduled' });
      }
      await pool.query(
        `UPDATE org_bills SET status = 'approved', scheduled_payment_date = NULL, updated_at = NOW() WHERE id = $1 AND org_id = $2`,
        [billId, orgId]
      );
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields: [{ fieldName: 'status', oldValue: 'scheduled', newValue: 'approved' }], metadata: reqMeta(req) }).catch(() => {});
      return res.json({ id: billId, status: 'approved' });
    } catch (e) {
      console.error('POST bill unschedule:', e.message);
      return res.status(500).json({ error: 'Could not unschedule bill' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bills/:id/payments', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    const orgId = req.orgId;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT p.*, a.code AS bank_account_code, a.name AS bank_account_name,
                COALESCE((SELECT l.id FROM org_bank_statement_lines l WHERE l.org_id = p.org_id AND l.ledger_transaction_id = p.ledger_transaction_id LIMIT 1),
                         (SELECT sp.statement_line_id FROM org_bank_statement_line_postings sp WHERE sp.ledger_transaction_id = p.ledger_transaction_id LIMIT 1)) AS statement_line_id
         FROM org_bill_payments p JOIN org_accounts a ON a.id = p.bank_account_id
         WHERE p.bill_id = $1 AND p.org_id = $2
         ORDER BY p.payment_date DESC, p.id DESC`,
        [billId, orgId]
      );
      return res.json({ payments: r.rows.map(rowToBillPayment) });
    } catch (e) {
      console.error('GET bill payments:', e.message);
      return res.status(500).json({ error: 'Could not load payments' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/payments', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const result = await runTool('bill.record_payment', ctxFromReq(pool, req), { ...(req.body || {}), id: req.params.id });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bill payment:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills/:id/payments/:paymentId/void', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const result = await runTool('bill.void_payment', ctxFromReq(pool, req), { id: req.params.id, payment_id: req.params.paymentId, reason: req.body && req.body.reason });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST bill payment void:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not void payment' });
    }
  });

  async function reverseApproval(req, res, outcome) {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (!reason) return res.status(400).json({ error: 'A reason is required.' });
    try {
      const r = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      const bill = r.rows[0];
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) return res.status(404).json({ error: 'Bill not found' });
      if (!['approved', 'scheduled'].includes(bill.status)) {
        return res.status(409).json({ error: bill.status === 'partially_paid' || bill.status === 'paid'
          ? 'This bill has payments. Void the payments in the bank Register first.' : `This bill cannot be ${outcome === 'void' ? 'voided' : 'reverted to draft'} from status ${bill.status}.`, code: 'not_reversible' });
      }
      const pay = await pool.query(`SELECT 1 FROM org_bill_payments WHERE bill_id = $1 AND status = 'posted' LIMIT 1`, [billId]);
      if (pay.rows.length) return res.status(409).json({ error: 'This bill has payments. Void the payments in the bank Register first.', code: 'has_payments' });
      const cn = await pool.query(`SELECT 1 FROM org_bill_credit_notes WHERE original_bill_id = $1 AND org_id = $2 AND status = 'applied' LIMIT 1`, [billId, orgId]);
      if (cn.rows.length) return res.status(409).json({ error: 'A vendor credit note is applied to this bill. Void the credit note first.', code: 'has_credit_note' });
      if (bill.ledger_transaction_id) {
        const t = await pool.query('SELECT fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [bill.ledger_transaction_id, orgId]);
        if (t.rows[0] && t.rows[0].status === 'posted') {
          if (await isFiscalYearLocked(pool, orgId, t.rows[0].fiscal_year)) {
            return res.status(409).json({ error: 'Fiscal year ' + t.rows[0].fiscal_year + ' is locked. Enter a vendor credit note to correct this bill.', code: 'fiscal_year_locked' });
          }
          const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: bill.ledger_transaction_id, voidReason: `Bill #${billId} ${outcome === 'void' ? 'voided' : 'reverted to draft'}: ${reason}` });
          if (v.httpStatus >= 400) return res.status(v.httpStatus).json(v.body);
        }
      }
      await pool.query(
        `UPDATE org_bills SET status = $1, approved_by = NULL, approved_at = NULL, scheduled_payment_date = NULL,
                ledger_transaction_id = CASE WHEN $1 = 'draft' THEN NULL ELSE ledger_transaction_id END, updated_at = NOW()
          WHERE id = $2 AND org_id = $3`, [outcome, billId, orgId]);
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
        fields: [{ fieldName: 'status', oldValue: bill.status, newValue: outcome }], metadata: { ...reqMeta(req), reason } }).catch(() => {});
      return res.json({ id: billId, status: outcome });
    } catch (e) {
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bill reverse approval:', e.message);
      return res.status(500).json({ error: 'Could not update the bill' });
    }
  }

  app.post('/api/organizational/orgs/:slug/bills/:id/revert-to-draft', ...orgAuth, financeWriter, (req, res) => reverseApproval(req, res, 'draft'));

  app.post('/api/organizational/orgs/:slug/bills/:id/void', ...orgAuth, financeWriter, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query('SELECT status FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      if (['approved', 'scheduled'].includes(r.rows[0].status)) return reverseApproval(req, res, 'void');
      if (!['draft', 'pending_approval'].includes(r.rows[0].status)) {
        return res.status(409).json({ error: r.rows[0].status === 'void' ? 'This bill is already void.' : 'This bill has payments. Void the payments in the bank Register first.', code: 'not_voidable' });
      }
      const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
      await pool.query(`UPDATE org_bills SET status = 'void', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [billId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
        fields: [{ fieldName: 'status', oldValue: r.rows[0].status, newValue: 'void' }],
        metadata: reason ? { ...reqMeta(req), reason } : reqMeta(req),
      }).catch(() => {});
      return res.json({ id: billId, status: 'void' });
    } catch (e) {
      console.error('POST bill void:', e.message);
      return res.status(500).json({ error: 'Could not void bill' });
    }
  });
}

module.exports = { registerBillsRoutes, translateBillWriteError, MICRO_PURCHASE_THRESHOLD_CENTS };
