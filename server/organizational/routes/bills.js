'use strict';

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction } = require('../lib/ledgerPosting');
const { recordBillPayment, voidBillPayment } = require('../lib/billInvoicePayments');
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MICRO_PURCHASE_THRESHOLD_CENTS = 1500000; // 2 CFR 200.320(a), $15,000, effective 2025-10-01
const SIMPLIFIED_ACQUISITION_THRESHOLD_CENTS = 25000000; // 2 CFR 200.1, $250,000 (41 U.S.C. 134)
const ADEQUATE_QUOTE_COUNT = 3; // 2 CFR 200.320(b): "adequate number of qualified sources"

/**
 * Bills' own DB-write-error translator -- deliberately separate from ledgerPosting.js's
 * translateLedgerWriteError (review fix 4): CA008 here is org_bills' own separation-of-duties
 * code, distinct from the Ledger's CA005, and needs its own bill-flavored message rather than
 * being caught by a handler that assumes org_ledger_transactions.
 */
function translateBillWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA003') {
    return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'One of these lines references an account that is a rollup/header account, not a postable account.' } };
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
  };
}

function rowToBillPayment(row) {
  return {
    id: row.id, bill_id: row.bill_id,
    bank_account_id: row.bank_account_id, bank_account_code: row.bank_account_code, bank_account_name: row.bank_account_name,
    payment_date: row.payment_date, amount_cents: String(row.amount_cents), reference: row.reference,
    status: row.status, ledger_transaction_id: row.ledger_transaction_id,
    created_by: row.created_by, created_at: row.created_at,
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

  app.get('/api/organizational/orgs/:slug/bills', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const status = req.query.status != null ? String(req.query.status) : null;
    const constituentId = req.query.constituent_id != null ? Number.parseInt(String(req.query.constituent_id), 10) : null;
    try {
      const conds = ['b.org_id = $1'];
      const params = [orgId];
      let p = 2;
      if (status) { conds.push(`b.status = $${p}`); params.push(status); p += 1; }
      if (Number.isInteger(constituentId) && constituentId > 0) { conds.push(`b.constituent_id = $${p}`); params.push(constituentId); p += 1; }

      // org_bills itself carries no program_id -- only org_bill_lines does -- so a
      // program-scoped caller's list is filtered by whether the bill has any line in
      // their granted program(s), not by a column on this table.
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
      return res.json({ bills: r.rows.map(rowToBill) });
    } catch (e) {
      console.error('GET bills:', e.message);
      return res.status(500).json({ error: 'Could not load bills' });
    }
  });

  /**
   * Bill document OCR prefill (2026-09-17) -- header fields only (vendor name, dates,
   * reference, total amount); never proposes account_id/program_id, since a scanned bill
   * can't know this org's chart of accounts. See billInvoiceOcr.js.
   *
   * Registered BEFORE /bills/:id -- same ordering reason as aging-report below.
   */
  app.post('/api/organizational/orgs/:slug/bills/ocr-preview', ...orgAuth, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    try {
      const { extracted, error } = await extractBillOrInvoiceFields(req.file.buffer, req.file.mimetype, 'bill');
      if (error) return res.status(422).json({ error });
      return res.json({ extracted });
    } catch (e) {
      console.error('POST bills/ocr-preview:', e.message);
      return res.status(500).json({ error: 'Could not scan this document' });
    }
  });

  /**
   * Vendor coding-history suggestion (2026-09-17) -- same idea as Bank Reconciliation's
   * coding-suggestion (bankReconciliation.js), generalized to key off a resolved
   * constituent_id instead of raw payee text: look at the most recent single-line bill for
   * this vendor and offer its account/program back as a prefill. Only single-line prior bills
   * count (a multi-line history is ambiguous about which line the vendor "usually" goes to).
   * Never applied automatically -- a human still confirms it in the line-item grid.
   */
  app.get('/api/organizational/orgs/:slug/bills/vendor-coding-suggestion', ...orgAuth, async (req, res) => {
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

  /**
   * AP aging report -- read-only, no new mechanism (spec 3.7), same posture as the existing
   * Bank Reconciliation report. Buckets by due_date (or bill_date if no due_date) against
   * today. Only 'approved', 'scheduled', and 'partially_paid' bills carry a real, currently-owed
   * liability -- draft/pending_approval haven't posted one yet, and paid/void/written-off
   * statuses aren't currently owed. total_cents nets out posted org_bill_payments so a
   * partially-paid bill shows its remaining balance, not its original full total.
   *
   * Registered BEFORE /bills/:id -- Express matches routes in registration order, and :id would
   * otherwise greedily match the literal path segment "aging-report" as a bill id.
   */
  app.get('/api/organizational/orgs/:slug/bills/aging-report', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const r = await pool.query(
        `SELECT b.id, b.reference, b.bill_date, b.due_date, c.display_name AS vendor_name,
                COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0)
                  - COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = b.id AND status = 'posted'), 0) AS total_cents,
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

  app.get('/api/organizational/orgs/:slug/bills/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT b.*, c.display_name AS vendor_name,
                COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0) AS total_cents
         FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
         WHERE b.id = $1 AND b.org_id = $2 LIMIT 1`,
        [billId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Bill not found' });
      const linesR = await pool.query(LINES_SELECT, [billId]);
      // RLS already drops any line outside a program-scoped caller's grants (migration 259);
      // if that leaves zero lines, this bill isn't theirs at all -- same 404 the list endpoint
      // would already have hidden it behind, not a 200 with an empty lines array.
      if (linesR.rows.length === 0 && programScopeFor(req) !== null) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      return res.json({ bill: rowToBill(r.rows[0]), lines: linesR.rows.map(rowToBillLine) });
    } catch (e) {
      console.error('GET bill detail:', e.message);
      return res.status(500).json({ error: 'Could not load bill' });
    }
  });

  app.post('/api/organizational/orgs/:slug/bills', ...orgAuth, async (req, res) => {
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
        `INSERT INTO org_bills (org_id, constituent_id, bill_date, due_date, reference, fiscal_year, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [orgId, constituentId, billDate, dueDate, body.reference != null ? String(body.reference) : null, fiscalYear, userId]
      );
      const billId = r.rows[0].id;
      await replaceLines(client, billId, parsedLines);
      await client.query('COMMIT');
      return res.status(201).json({ id: billId, status: 'draft' });
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

  // Full-edit statuses: nothing has posted to the ledger yet (the ledger transaction is only
  // created in the /approve handler), so editing here carries no more risk than voiding
  // already does -- the void endpoint's own error message already concedes a
  // pending_approval bill is safe to discard outright.
  const BILL_FULL_EDIT_STATUSES = new Set(['draft', 'pending_approval']);
  // Once a bill has posted (approved and beyond), lines/amount/vendor need a credit/debit
  // note instead (matches QBO/Xero practice) -- but due_date, reference, and
  // procurement_rationale never touch org_ledger_lines, so locking them has no accounting
  // justification. 'void' bills never posted either, but editing a cancelled record doesn't
  // make sense regardless -- stays fully locked.
  const BILL_METADATA_ONLY_STATUSES = new Set(['approved', 'scheduled', 'partially_paid', 'paid']);
  const BILL_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference', 'procurement_rationale']);

  app.patch('/api/organizational/orgs/:slug/bills/:id', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};

    // Pre-transaction lookups go through pool.query (self-scoped per call) -- a client checked
    // out via pool.connect() only gets its app.current_org_id GUC injected on ITS OWN first
    // BEGIN (scopedPool.js's piggyback design), so any client.query() issued before that BEGIN
    // runs with no org context and RLS silently returns zero rows.
    const existing = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Bill not found' });
    const bill = existing.rows[0];

    // RLS already drops any line outside a program-scoped caller's grants (migration 259);
    // a caller only ever sees THEIR lines here, so an empty result means this bill has no
    // lines in scope at all -- treat it as not found, same as the GET detail route does.
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
          error: `Once approved, only due_date, reference, and procurement_rationale can be edited directly -- ${disallowed.join(', ')} requires a vendor credit/debit note instead.`,
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
      // Metadata-only edit (or a full-edit request that didn't touch lines) on a bill that
      // touches a program outside this caller's grant -- block it even though no line
      // content is changing, same as the mutation-requires-full-scope rule everywhere else.
      return res.status(403).json({ error: 'You do not have access to edit this bill.' });
    }

    const dueDate = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : bill.due_date;
    if (dueDate && !DATE_RE.test(dueDate)) return res.status(400).json({ error: 'due_date must be YYYY-MM-DD' });

    const nextConstituentId = isFullEdit && body.constituent_id !== undefined
      ? Number.parseInt(String(body.constituent_id), 10) : bill.constituent_id;
    const nextReference = body.reference !== undefined ? (body.reference ? String(body.reference) : null) : bill.reference;
    const nextRationale = body.procurement_rationale !== undefined ? (body.procurement_rationale ? String(body.procurement_rationale) : null) : bill.procurement_rationale;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE org_bills SET
           constituent_id = $1, due_date = $2, reference = $3, procurement_rationale = $4, updated_at = NOW()
         WHERE id = $5 AND org_id = $6`,
        [nextConstituentId, dueDate, nextReference, nextRationale, billId, orgId]
      );
      if (parsedLines) await replaceLines(client, billId, parsedLines);
      await client.query('COMMIT');

      // Metadata-only edits on an already-posted bill are exactly the case this module's
      // audit trail was previously silent on (the reversal chain was the only record of
      // anything changing) -- log what actually changed, not just that a PATCH happened.
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

  /**
   * Draft -> Pending Approval. 2 CFR 200.320 Subpart D, tiered by bill total on a federal-
   * award-tagged bill -- checked here, at submit, not at Approval, so the requirement is
   * visible before someone tries to approve and gets blocked:
   *   - >= $15,000 (micro-purchase threshold, 200.320(a)): procurement_rationale + >= 1
   *     attached 'procurement_quote' document.
   *   - >= $250,000 (simplified acquisition threshold, 200.320(b)-(d)): procurement_rationale +
   *     either a 'procurement_solicitation' document (formal sealed bid/competitive proposal)
   *     or >= ADEQUATE_QUOTE_COUNT 'procurement_quote' documents.
   * The document-attachment half of this check was originally deferred until the Documents
   * extension landed (migration 214 added the 'procurement_quote' category + source_ref pair;
   * migration 245 added 'procurement_solicitation' for the higher tier) -- both have landed now.
   */
  app.post('/api/organizational/orgs/:slug/bills/:id/submit', ...orgAuth, async (req, res) => {
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
          // 2 CFR 200.320(c)/(d): at/above the simplified acquisition threshold, quotes alone
          // are no longer sufficient -- requires either a full formal sealed-bid/competitive-
          // proposal solicitation package, or documented quotes from an adequate number of
          // qualified sources (the same small-purchase evidence, just a higher bar than the
          // single quote that satisfies the tier below).
          if (solicitationCount === 0 && quoteCount < ADEQUATE_QUOTE_COUNT) {
            return res.status(422).json({
              error: `This bill touches a federal-award grant and is at or above the simplified acquisition threshold ($250,000) -- attach either a formal sealed-bid/competitive-proposal solicitation package, or at least ${ADEQUATE_QUOTE_COUNT} price quotes from qualified sources, before it can be submitted.`,
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

  /**
   * Pending Approval -> Approved -- this IS the moment the liability posts. Sets approved_by
   * (org_enforce_bill_approval_separation_of_duties rejects same-user approval, but only when
   * the bill actually touches a federal-award grant -- migration 207), then calls
   * postLedgerTransaction with the internal-only bypass (fix 1) so the resulting transaction
   * isn't re-gated to pending_approval a second time: this Bill's own approval step already is
   * that check for federal-award bills, and ordinary bills were never gated in the first place.
   */
  // Approve is a control point, separate from submit -- permissions matrix finalized
  // 2026-09-21 (.claude/plans/2026-09-19-solid-odi-demo-readiness.md): submitting a bill stays
  // open to any org member (including 'program'), approving it is finance/admin only.
  app.post('/api/organizational/orgs/:slug/bills/:id/approve', ...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES]), async (req, res) => {
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
      if (bill.status !== 'pending_approval') {
        return res.status(409).json({ error: `Bill is not awaiting approval (status: ${bill.status})`, code: 'not_pending_approval' });
      }

      // Separation-of-duties check happens as a side effect of this UPDATE (trigger-enforced).
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
        line_memo: l.line_memo,
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
        memo: `Bill #${billId}${bill.reference ? ' (' + bill.reference + ')' : ''}`,
        payee: vendorR.rows[0] ? vendorR.rows[0].display_name : null,
        referenceNumber: bill.reference,
        lines: ledgerLines,
        source: 'bill_approval',
        internalApproval: { approvedBy: userId, approvedAt, sourceRefId: billId, sourceRefType: 'bill' },
      });
      if (postResult.httpStatus >= 400) {
        // Roll back the approval side of the bill so it isn't left half-approved with no
        // ledger transaction -- the bill's approved_by/approved_at only make sense paired with
        // a real posted transaction.
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
  });

  /**
   * Schedule an approved bill for a future payment date (spec's `scheduled` status, unreachable
   * until now -- flagged as a known gap since rev 73). Deliberately manual on both ends: this
   * only records the intended date, it does not post anything or run a job that pays it
   * automatically on that date -- an unattended-payment feature is a materially different,
   * larger decision than making the status reachable, and isn't built here. A scheduled bill can
   * still be paid immediately (recordBillPayment's guard already allows 'scheduled'), same as
   * real-world bookkeeping tools let you pay a scheduled bill early.
   */
  app.post('/api/organizational/orgs/:slug/bills/:id/schedule', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
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
      return res.json({ id: billId, status: 'scheduled', scheduled_payment_date: scheduledPaymentDate });
    } catch (e) {
      console.error('POST bill schedule:', e.message);
      return res.status(500).json({ error: 'Could not schedule bill' });
    }
  });

  /** Cancel a scheduled payment date, reverting to approved -- not a void, the liability is still real and owed. */
  app.post('/api/organizational/orgs/:slug/bills/:id/unschedule', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
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
      return res.json({ id: billId, status: 'approved' });
    } catch (e) {
      console.error('POST bill unschedule:', e.message);
      return res.status(500).json({ error: 'Could not unschedule bill' });
    }
  });

  app.get('/api/organizational/orgs/:slug/bills/:id/payments', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const r = await pool.query(
        `SELECT p.*, a.code AS bank_account_code, a.name AS bank_account_name
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

  /**
   * Bills support partial payment (matching invoices) -- amount_cents is caller-supplied and
   * validated against the remaining balance (total minus prior posted payments), not derived
   * from the full total. Only an Approved or Partially Paid bill (a real posted liability) can
   * be paid; Draft/Pending Approval bills have nothing to clear yet.
   */
  app.post('/api/organizational/orgs/:slug/bills/:id/payments', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    const bankAccountId = Number.parseInt(String(body.bank_account_id), 10);
    const paymentDate = body.payment_date != null ? String(body.payment_date) : null;
    const amountCents = Number.parseInt(String(body.amount_cents), 10);
    if (!Number.isInteger(bankAccountId) || bankAccountId < 1) return res.status(400).json({ error: 'bank_account_id is required' });
    if (!paymentDate || !DATE_RE.test(paymentDate)) return res.status(400).json({ error: 'payment_date is required and must be YYYY-MM-DD' });
    if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount_cents must be a positive integer' });

    try {
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      const result = await recordBillPayment(pool, { orgId, userId, billId, bankAccountId, paymentDate, amountCents, reference: body.reference || null });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      const translated = translateBillWriteError(e);
      if (translated) return res.status(translated.status).json(translated.body);
      console.error('POST bill payment:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not record payment' });
    }
  });

  /**
   * Void a payment (typo'd amount/wrong account, not "this bill isn't owed after all" -- that's
   * a vendor credit note instead). Same two-path discipline as Bank Reconciliation's
   * unreconcile: an open fiscal year just voids the payment's own transaction; a locked one
   * never touches history and posts a mirror-image reversing entry in the current period instead.
   */
  app.post('/api/organizational/orgs/:slug/bills/:id/payments/:paymentId/void', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const billId = Number.parseInt(String(req.params.id), 10);
    const paymentId = Number.parseInt(String(req.params.paymentId), 10);
    const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (!Number.isInteger(billId) || billId < 1 || !Number.isInteger(paymentId) || paymentId < 1) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    if (!reason) return res.status(400).json({ error: 'reason is required' });

    try {
      if (!headerProgramsInScope(req, await billLinePrograms(pool, billId))) {
        return res.status(404).json({ error: 'Bill not found' });
      }
      const result = await voidBillPayment(pool, { orgId, userId, billId, paymentId, reason });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST bill payment void:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not void payment' });
    }
  });

  /**
   * Void a bill that hasn't posted a liability yet (Draft or Pending Approval only). An
   * Approved bill's liability is real, posted history -- cancelling it goes through a vendor
   * credit note instead (spec 3.6), same append-only discipline as everywhere else in this
   * system: never edit or delete a posted record, only ever add an offsetting one.
   */
  app.post('/api/organizational/orgs/:slug/bills/:id/void', ...orgAuth, async (req, res) => {
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
      if (!['draft', 'pending_approval'].includes(r.rows[0].status)) {
        return res.status(409).json({ error: 'Only a draft or pending-approval bill can be voided directly -- an approved bill needs a vendor credit note instead.', code: 'not_voidable' });
      }
      await pool.query(`UPDATE org_bills SET status = 'void', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [billId, orgId]);
      logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId,
        fields: [{ fieldName: 'status', oldValue: r.rows[0].status, newValue: 'void' }],
        metadata: reqMeta(req),
      }).catch(() => {});
      return res.json({ id: billId, status: 'void' });
    } catch (e) {
      console.error('POST bill void:', e.message);
      return res.status(500).json({ error: 'Could not void bill' });
    }
  });
}

module.exports = { registerBillsRoutes, translateBillWriteError, MICRO_PURCHASE_THRESHOLD_CENTS };
