'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction } = require('../lib/ledgerPosting');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function translateCreditNoteWriteError(e) {
  if (isFiscalYearLockedError(e)) return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  if (e.code === 'CA003') return { status: 422, body: { error: e.message, code: 'non_posting_account', message: 'That account is a rollup/header account, not a postable account.' } };
  if (e.code === 'CA004') return { status: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This references an account, program, bill/invoice, or constituent that belongs to a different organization, or the wrong role.' } };
  if (e.code === '23514' || e.code === '23503') return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  return null;
}

function rowToCreditNote(row) {
  return {
    id: row.id, org_id: row.org_id, constituent_id: row.constituent_id,
    contact_name: row.contact_name || null,
    original_bill_id: row.original_bill_id, original_invoice_id: row.original_invoice_id,
    account_id: row.account_id, account_code: row.account_code, account_name: row.account_name,
    program_id: row.program_id, program_name: row.program_name,
    amount_cents: String(row.amount_cents), reason: row.reason, status: row.status,
    ledger_transaction_id: row.ledger_transaction_id, fiscal_year: row.fiscal_year,
    created_by: row.created_by, created_at: row.created_at,
  };
}

function registerCreditNotesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  // ── Shared create/apply/void logic, parameterized by side ──
  function registerSide({ kind, table, constituentRoleCol, originalCol, apAccountFn, arAccountFn }) {
    const base = '/api/organizational/orgs/:slug/' + kind;

    app.get(base, ...orgAuth, async (req, res) => {
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

    app.post(base, ...orgAuth, async (req, res) => {
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

      let fiscalYear;
      try {
        const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
        fiscalYear = fiscalYearForDate(noteDate, fyEndMonth);
      } catch (e) {
        return res.status(500).json({ error: 'Could not resolve fiscal year' });
      }

      try {
        const r = await pool.query(
          `INSERT INTO ${table} (org_id, constituent_id, ${originalCol}, account_id, program_id, amount_cents, reason, fiscal_year, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [orgId, constituentId, originalId, accountId, programId, amountCents, body.reason || null, fiscalYear, userId]
        );
        return res.status(201).json({ id: r.rows[0].id, status: 'draft' });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('POST ' + kind + ':', e.message);
        return res.status(500).json({ error: 'Could not create credit note' });
      }
    });

    app.post(base + '/:id/apply', ...orgAuth, async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      try {
        const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
        if (!r.rows.length) return res.status(404).json({ error: 'Credit note not found' });
        const note = r.rows[0];
        if (note.status !== 'draft') return res.status(409).json({ error: `Credit note is not in draft status (status: ${note.status})`, code: 'not_draft' });

        const contraAccountR = await pool.query(`SELECT ${apAccountFn ? apAccountFn : arAccountFn}($1) AS id`, [orgId]);
        const contraAccountId = contraAccountR.rows[0].id;
        const contactR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [note.constituent_id]);

        // Bill credit note: reduces AP (debit) and reverses the expense (credit).
        // Invoice credit note: reverses revenue (debit) and reduces AR (credit).
        const lines = apAccountFn
          ? [
              { account_id: contraAccountId, program_id: note.program_id, debit_cents: Number(note.amount_cents), credit_cents: 0, line_memo: `Credit note #${note.id}` },
              { account_id: note.account_id, program_id: note.program_id, debit_cents: 0, credit_cents: Number(note.amount_cents), line_memo: `Credit note #${note.id}: ${note.reason || ''}` },
            ]
          : [
              { account_id: note.account_id, program_id: note.program_id, debit_cents: Number(note.amount_cents), credit_cents: 0, line_memo: `Credit note #${note.id}: ${note.reason || ''}` },
              { account_id: contraAccountId, program_id: note.program_id, debit_cents: 0, credit_cents: Number(note.amount_cents), line_memo: `Credit note #${note.id}` },
            ];

        const postResult = await postLedgerTransaction(pool, {
          orgId, userId,
          transactionDate: new Date().toISOString().slice(0, 10),
          memo: `Credit note #${note.id}`,
          payee: contactR.rows[0] ? contactR.rows[0].display_name : null,
          referenceNumber: null,
          lines,
          source: kind === 'bill-credit-notes' ? 'bill_approval' : 'invoice',
        });
        if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

        await pool.query(`UPDATE ${table} SET status = 'applied', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`, [postResult.body.id, id, orgId]);
        return res.json({ id, status: 'applied', ledger_transaction_id: postResult.body.id });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('POST ' + kind + '/apply:', e.message, e.stack);
        return res.status(500).json({ error: 'Could not apply credit note' });
      }
    });

    app.post(base + '/:id/void', ...orgAuth, async (req, res) => {
      const orgId = req.orgId;
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      try {
        const r = await pool.query(`SELECT status FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
        if (!r.rows.length) return res.status(404).json({ error: 'Credit note not found' });
        if (r.rows[0].status !== 'draft') return res.status(409).json({ error: 'Only a draft credit note can be voided directly.', code: 'not_voidable' });
        await pool.query(`UPDATE ${table} SET status = 'void' WHERE id = $1 AND org_id = $2`, [id, orgId]);
        return res.json({ id, status: 'void' });
      } catch (e) {
        console.error('POST ' + kind + '/void:', e.message);
        return res.status(500).json({ error: 'Could not void credit note' });
      }
    });
  }

  registerSide({ kind: 'bill-credit-notes', table: 'org_bill_credit_notes', originalCol: 'original_bill_id', apAccountFn: 'org_get_or_create_ap_account' });
  registerSide({ kind: 'invoice-credit-notes', table: 'org_invoice_credit_notes', originalCol: 'original_invoice_id', arAccountFn: 'org_get_or_create_ar_account' });
}

module.exports = { registerCreditNotesRoutes };
