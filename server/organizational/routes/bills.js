'use strict';
const { addFileInfo } = require('../lib/recordFiles');

const multer = require('multer');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLocked, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { runTool, ctxFromReq } = require('../tools');
const { billCreditSql, invoiceCreditSql } = require('../lib/billInvoicePayments');
const { displayCents } = require('../lib/voidedDisplay');
const { logAudit, reqMeta } = require('../lib/auditLog');
const { extractBillOrInvoiceFields } = require('../lib/billInvoiceOcr');
const { suggestBillCoding } = require('../lib/billLineSuggestions');
const { translateBillWriteError } = require('../lib/documentWriteErrors');
const { programScopeFor, appendProgramScopeExistsClause, headerProgramsInScope } = require('../lib/programScope');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

const { parseBillLines, replaceBillLines: replaceLines, BILL_LINES_SELECT: LINES_SELECT } = require('../lib/documentLines');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MICRO_PURCHASE_THRESHOLD_CENTS = 1500000;
const SIMPLIFIED_ACQUISITION_THRESHOLD_CENTS = 35000000;
const ADEQUATE_QUOTE_COUNT = 3;

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

async function billLinePrograms(pool, billId) {
  const r = await pool.query('SELECT program_id FROM org_bill_lines WHERE bill_id = $1', [billId]);
  return r.rows.map((row) => row.program_id);
}

function registerBillsRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

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


  app.patch('/api/organizational/orgs/:slug/bills/:id', ...orgAuth, financeWriter, async (req, res) => {
    try {
      const out = await runTool('bill.update', ctxFromReq(pool, req), { ...(req.body || {}), id: req.params.id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('PATCH bill:', e.message);
      return res.status(500).json({ error: 'Could not update bill' });
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
    const billId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(billId) || billId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const out = await runTool('bill.approve', ctxFromReq(pool, req), { id: billId });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST bill approve:', e.message, e.stack);
      return res.status(500).json({ error: 'Could not approve bill' });
    }
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

module.exports = { registerBillsRoutes, MICRO_PURCHASE_THRESHOLD_CENTS };
