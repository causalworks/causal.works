'use strict';

const { requireAuth } = require('../../auth');
const { displayCents } = require('../lib/voidedDisplay');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { postLedgerTransaction, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { logAudit, diffFields } = require('../lib/auditLog');
const { refreshBillStatusAfterCredit, refreshInvoiceStatusAfterCredit } = require('../lib/billInvoicePayments');

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
    amount_cents: String(row.amount_cents), display_amount_cents: String(displayCents(row.status, row.amount_cents)), reason: row.reason, status: row.status,
    ledger_transaction_id: row.ledger_transaction_id, fiscal_year: row.fiscal_year, note_date: row.note_date ? String(row.note_date).slice(0, 10) : null,
    created_by: row.created_by, created_at: row.created_at,
  };
}

function registerCreditNotesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const financeWriter = requireAccountingWriter(pool);

  function registerSide({ kind, table, constituentRoleCol, originalCol, apAccountFn, arAccountFn, parentTable, totalSql, noun, refreshStatus }) {
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
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('POST ' + kind + ':', e.message);
        return res.status(500).json({ error: 'Could not create credit note' });
      }
    });

    app.post(base + '/:id/apply', ...orgAuth, financeWriter, async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      try {
        const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
        if (!r.rows.length) return res.status(404).json({ error: 'Credit note not found' });
        const note = r.rows[0];
        if (note.status !== 'draft') return res.status(409).json({ error: `Credit note is not in draft status (status: ${note.status})`, code: 'not_draft' });

        if (note[originalCol]) {
          const owed = await pool.query(
            `SELECT (${totalSql}) - COALESCE((SELECT SUM(amount_cents) FROM ${table} WHERE ${originalCol} = p.id AND status = 'applied'), 0) AS left_cents
               FROM ${parentTable} p WHERE p.id = $1 AND p.org_id = $2`, [note[originalCol], orgId]);
          if (owed.rows.length && Number(note.amount_cents) > Number(owed.rows[0].left_cents)) {
            return res.status(409).json({ error: 'The credit note is more than what is left on the ' + noun + ' after other credit notes.', code: 'exceeds_balance' });
          }
        }

        const contraAccountR = await pool.query(`SELECT ${apAccountFn ? apAccountFn : arAccountFn}($1) AS id`, [orgId]);
        const contraAccountId = contraAccountR.rows[0].id;
        const contactR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [note.constituent_id]);

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
          transactionDate: note.note_date || new Date().toISOString().slice(0, 10),
          memo: `Credit note #${note.id}`,
          payee: contactR.rows[0] ? contactR.rows[0].display_name : null,
          referenceNumber: null,
          lines,
          source: kind === 'bill-credit-notes' ? 'bill_approval' : 'invoice',
          constituentId: note.constituent_id,
        });
        if (postResult.httpStatus >= 400) return res.status(postResult.httpStatus).json(postResult.body);

        await pool.query(`UPDATE ${table} SET status = 'applied', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`, [postResult.body.id, id, orgId]);
        if (note[originalCol]) await refreshStatus(pool, orgId, note[originalCol]);
        return res.json({ id, status: 'applied', ledger_transaction_id: postResult.body.id });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('POST ' + kind + '/apply:', e.message, e.stack);
        return res.status(500).json({ error: 'Could not apply credit note' });
      }
    });

    app.patch(base + '/:id', ...orgAuth, financeWriter, async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      const body = req.body || {};
      try {
        const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
        if (!r.rows.length) return res.status(404).json({ error: 'Credit note not found' });
        const note = r.rows[0];
        if (note.status === 'void') return res.status(409).json({ error: 'A voided credit note cannot be changed.', code: 'already_void' });
        const applied = note.status === 'applied';
        const changeReason = body.change_reason != null ? String(body.change_reason).trim() : '';
        if (applied) {
          const blocked = ['amount_cents', 'date', 'constituent_id', originalCol].filter((k) => k in body && String(body[k] ?? '') !== String(k === 'date' ? String(note.note_date || '').slice(0, 10) : (k === 'amount_cents' ? note.amount_cents : note[k === originalCol ? originalCol : k] ?? '')));
          if (blocked.length) return res.status(409).json({ error: 'The amount, date, contact and linked ' + noun + ' of an applied credit note cannot change. Void it and enter a new one.', code: 'applied_locked' });
          if (!changeReason) return res.status(400).json({ error: 'A reason for the change is required.', code: 'reason_required' });
        }
        const next = {
          account_id: body.account_id != null ? Number.parseInt(String(body.account_id), 10) : note.account_id,
          program_id: body.program_id != null ? Number.parseInt(String(body.program_id), 10) : note.program_id,
          amount_cents: body.amount_cents != null ? Number.parseInt(String(body.amount_cents), 10) : Number(note.amount_cents),
          note_date: body.date != null ? String(body.date) : String(note.note_date || '').slice(0, 10),
          reason: body.reason !== undefined ? (String(body.reason || '').trim() || null) : note.reason,
          original: body[originalCol] !== undefined ? (body[originalCol] === null || body[originalCol] === '' ? null : Number.parseInt(String(body[originalCol]), 10)) : note[originalCol],
        };
        if (!Number.isInteger(next.account_id) || next.account_id < 1 || !Number.isInteger(next.program_id) || next.program_id < 1) return res.status(400).json({ error: 'Account and program are required.' });
        if (!Number.isInteger(next.amount_cents) || next.amount_cents <= 0) return res.status(400).json({ error: 'amount_cents must be a positive integer' });
        if (!DATE_RE.test(next.note_date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
        if (next.original != null) {
          const p = await pool.query(`SELECT constituent_id, (${totalSql}) AS total_cents FROM ${parentTable} p WHERE p.id = $1 AND p.org_id = $2`, [next.original, orgId]);
          if (!p.rows.length) return res.status(404).json({ error: 'The ' + noun + ' was not found' });
          if (Number(p.rows[0].constituent_id) !== Number(note.constituent_id)) return res.status(400).json({ error: 'The credit note must be for the same contact as the ' + noun + '.' });
          if (next.amount_cents > Number(p.rows[0].total_cents)) return res.status(400).json({ error: 'The credit note cannot be more than the ' + noun + ' total.' });
        }
        const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
        const fiscalYear = fiscalYearForDate(next.note_date, fyEndMonth);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          if (applied && note.ledger_transaction_id) {
            await client.query('UPDATE org_ledger_lines SET account_id = $1 WHERE transaction_id = $2 AND account_id = $3', [next.account_id, note.ledger_transaction_id, note.account_id]);
            await client.query('UPDATE org_ledger_lines SET program_id = $1 WHERE transaction_id = $2', [next.program_id, note.ledger_transaction_id]);
          }
          await client.query(`UPDATE ${table} SET account_id = $1, program_id = $2, amount_cents = $3, note_date = $4, reason = $5, ${originalCol} = $6, fiscal_year = $7 WHERE id = $8 AND org_id = $9`,
            [next.account_id, next.program_id, next.amount_cents, next.note_date, next.reason, next.original, fiscalYear, id, orgId]);
          await client.query('COMMIT');
        } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
        if (applied) {
          logAudit(pool, { orgId, userId, action: 'update', tableName: table, recordId: id,
            fields: diffFields(note, { account_id: next.account_id, program_id: next.program_id, reason: next.reason }, ['account_id', 'program_id', 'reason']), metadata: { change_reason: changeReason } }).catch(() => {});
        }
        return res.json({ id, status: note.status });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('PATCH ' + kind + ':', e.message);
        return res.status(500).json({ error: 'Could not change credit note' });
      }
    });

    app.post(base + '/:id/void', ...orgAuth, financeWriter, async (req, res) => {
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      const id = Number.parseInt(String(req.params.id), 10);
      if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'Invalid id' });
      const reason = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
      try {
        const r = await pool.query(`SELECT status, ledger_transaction_id, ${originalCol} AS original_id FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
        if (!r.rows.length) return res.status(404).json({ error: 'Credit note not found' });
        const { status, ledger_transaction_id: txnId } = r.rows[0];
        if (status === 'void') return res.status(409).json({ error: 'This credit note is already void.', code: 'already_void' });
        if (status === 'applied') {
          if (!reason) return res.status(400).json({ error: 'A reason is required to void an applied credit note.', code: 'reason_required' });
          const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: txnId, voidReason: `Credit note #${id} voided: ${reason}` });
          if (v.httpStatus >= 400) return res.status(v.httpStatus).json(v.body);
        }
        await pool.query(`UPDATE ${table} SET status = 'void' WHERE id = $1 AND org_id = $2`, [id, orgId]);
        if (status === 'applied' && r.rows[0].original_id) await refreshStatus(pool, orgId, r.rows[0].original_id);
        return res.json({ id, status: 'void' });
      } catch (e) {
        const translated = translateCreditNoteWriteError(e);
        if (translated) return res.status(translated.status).json(translated.body);
        console.error('POST ' + kind + '/void:', e.message);
        return res.status(500).json({ error: 'Could not void credit note' });
      }
    });
  }

  registerSide({ kind: 'bill-credit-notes', table: 'org_bill_credit_notes', originalCol: 'original_bill_id', apAccountFn: 'org_get_or_create_ap_account',
    parentTable: 'org_bills', noun: 'bill', refreshStatus: refreshBillStatusAfterCredit, totalSql: 'SELECT COALESCE(SUM(amount_cents), 0) FROM org_bill_lines WHERE bill_id = p.id' });
  registerSide({ kind: 'invoice-credit-notes', table: 'org_invoice_credit_notes', originalCol: 'original_invoice_id', arAccountFn: 'org_get_or_create_ar_account',
    parentTable: 'org_invoices', noun: 'invoice', refreshStatus: refreshInvoiceStatusAfterCredit, totalSql: 'SELECT COALESCE(SUM(ROUND(quantity * unit_amount_cents)), 0) FROM org_invoice_lines WHERE invoice_id = p.id' });
}

module.exports = { registerCreditNotesRoutes };
