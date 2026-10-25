'use strict';

const { requireAuth } = require('../../auth');
const { displayCents } = require('../lib/voidedDisplay');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { runTool, ctxFromReq } = require('../tools');
const { translateCreditNoteWriteError } = require('../tools/creditNotes');
const { refreshBillStatusAfterCredit, refreshInvoiceStatusAfterCredit } = require('../lib/billInvoicePayments');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function rowToCreditNote(row) {
  return {
    id: row.id, org_id: row.org_id, constituent_id: row.constituent_id,
    contact_name: row.contact_name || null,
    original_bill_id: row.original_bill_id, original_invoice_id: row.original_invoice_id,
    account_id: row.account_id, account_code: row.account_code, account_name: row.account_name,
    program_id: row.program_id, program_name: row.program_name,
    amount_cents: String(row.amount_cents), display_amount_cents: String(displayCents(row.status, row.amount_cents)), reason: row.reason, status: row.status,
    ledger_transaction_id: row.ledger_transaction_id, fiscal_year: row.fiscal_year, note_date: row.note_date ? String(row.note_date).slice(0, 10) : null,
    created_by: row.created_by, created_at: row.created_at,
  };
}

function registerCreditNotesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  function registerSide({ toolPrefix, kind, table, constituentRoleCol, originalCol, apAccountFn, arAccountFn, parentTable, totalSql, noun, refreshStatus }) {
    const base = '/api/organizational/orgs/:slug/' + kind;

    app.get(base, ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
      const orgId = req.orgId;
      const status = req.query.status != null ? String(req.query.status) : null;
      try {
        const conds = ['n.org_id = $1'];
        const params = [orgId];
        if (status) { conds.push('n.status = $2'); params.push(status); }
        const r = await pool.query(
          `SELECT n.*, c.display_name AS contact_name, a.code AS account_code, a.name AS account_name, p.name AS program_name
           FROM ${table} n
           JOIN org_constituents c ON c.id = n.constituent_id
           JOIN org_accounts a ON a.id = n.account_id
           JOIN org_programs p ON p.id = n.program_id
           WHERE ${conds.join(' AND ')}
           ORDER BY n.created_at DESC, n.id DESC LIMIT 500`,
          params
        );
        return res.json({ credit_notes: r.rows.map(rowToCreditNote) });
      } catch (e) {
        console.error('GET ' + kind + ':', e.message);
        return res.status(500).json({ error: 'Could not load credit notes' });
      }
    });

    app.post(base, ...orgAuth, financeWriter, async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      const body = req.body || {};
      const constituentId = Number.parseInt(String(body.constituent_id), 10);
      const accountId = Number.parseInt(String(body.account_id), 10);
      const programId = Number.parseInt(String(body.program_id), 10);
      const amountCents = Number.parseInt(String(body.amount_cents), 10);
      const noteDate = body.date != null ? String(body.date) : null;
      if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'constituent_id is required' });
      if (!Number.isInteger(accountId) || accountId < 1) return res.status(400).json({ error: 'account_id is required' });
      if (!Number.isInteger(programId) || programId < 1) return res.status(400).json({ error: 'program_id is required' });
      if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount_cents must be a positive integer' });
      if (!noteDate || !DATE_RE.test(noteDate)) return res.status(400).json({ error: 'date is required and must be YYYY-MM-DD' });
      const originalId = body[originalCol] != null && body[originalCol] !== '' ? Number.parseInt(String(body[originalCol]), 10) : null;

      if (originalId != null) {
        if (!Number.isInteger(originalId) || originalId < 1) return res.status(400).json({ error: originalCol + ' must be a positive integer' });
        const p = await pool.query(`SELECT constituent_id, (${totalSql}) AS total_cents FROM ${parentTable} p WHERE p.id = $1 AND p.org_id = $2`, [originalId, orgId]);
        if (!p.rows.length) return res.status(404).json({ error: 'The ' + noun + ' was not found' });
        if (Number(p.rows[0].constituent_id) !== constituentId) return res.status(400).json({ error: 'The credit note must be for the same contact as the ' + noun + '.' });
        if (amountCents > Number(p.rows[0].total_cents)) return res.status(400).json({ error: 'The credit note cannot be more than the ' + noun + ' total.' });
      }

      let fiscalYear;
      try {
        const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
        fiscalYear = fiscalYearForDate(noteDate, fyEndMonth);
      } catch (e) {
        return res.status(500).json({ error: 'Could not resolve fiscal year' });
      }

      try {
        const r = await pool.query(
          `INSERT INTO ${table} (org_id, constituent_id, ${originalCol}, account_id, program_id, amount_cents, reason, fiscal_year, created_by, note_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [orgId, constituentId, originalId, accountId, programId, amountCents, body.reason || null, fiscalYear, userId, noteDate]
        );
        return res.status(201).json({ id: r.rows[0].id, status: 'draft' });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.httpStatus).json(translated.body);
        console.error('POST ' + kind + ':', e.message);
        return res.status(500).json({ error: 'Could not create credit note' });
      }
    });

    const viaTool = (verb, errMsg, build) => async (req, res) => {
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      try {
        const out = await runTool(toolPrefix + '.' + verb, ctxFromReq(pool, req), build(req, id));
        return res.status(out.httpStatus).json(out.body);
      } catch (e) {
        console.error(verb + ' ' + kind + ':', e.message);
        return res.status(500).json({ error: errMsg });
      }
    };
    app.post(base + '/:id/apply', ...orgAuth, financeWriter, viaTool('apply', 'Could not apply credit note', (req, id) => ({ id })));
    app.patch(base + '/:id', ...orgAuth, financeWriter, viaTool('update', 'Could not change credit note', (req, id) => ({ ...(req.body || {}), id })));
    app.post(base + '/:id/void', ...orgAuth, financeWriter, viaTool('void', 'Could not void credit note', (req, id) => ({ id, reason: req.body && req.body.reason })));
  }

  registerSide({ toolPrefix: 'bill_credit_note', kind: 'bill-credit-notes', table: 'org_bill_credit_notes', originalCol: 'original_bill_id', apAccountFn: 'org_get_or_create_ap_account',
    parentTable: 'org_bills', noun: 'bill', refreshStatus: refreshBillStatusAfterCredit, totalSql: 'SELECT COALESCE(SUM(amount_cents), 0) FROM org_bill_lines WHERE bill_id = p.id' });
  registerSide({ toolPrefix: 'invoice_credit_note', kind: 'invoice-credit-notes', table: 'org_invoice_credit_notes', originalCol: 'original_invoice_id', arAccountFn: 'org_get_or_create_ar_account',
    parentTable: 'org_invoices', noun: 'invoice', refreshStatus: refreshInvoiceStatusAfterCredit, totalSql: 'SELECT COALESCE(SUM(ROUND(quantity * unit_amount_cents)), 0) FROM org_invoice_lines WHERE invoice_id = p.id' });
}

module.exports = { registerCreditNotesRoutes };
