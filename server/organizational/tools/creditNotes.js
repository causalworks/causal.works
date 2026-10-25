'use strict';

// Tools that apply, change and void bill and invoice credit notes. Applying posts the ledger entry; changing an applied note recodes its entry; voiding reverses it.

const { defineTool } = require('./registry');
const { acquireDocumentLock } = require('../lib/documentLock');
const { postLedgerTransaction, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { isFiscalYearLockedError } = require('../lib/fiscalYearLockError');
const { logAudit, diffFields } = require('../lib/auditLog');
const { refreshBillStatusAfterCredit, refreshInvoiceStatusAfterCredit } = require('../lib/billInvoicePayments');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function translateCreditNoteWriteError(e) {
  if (isFiscalYearLockedError(e)) return { httpStatus: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  if (e.code === 'CA003') return { httpStatus: 422, body: { error: e.message, code: 'non_posting_account', message: 'That account is a rollup/header account, not a postable account.' } };
  if (e.code === 'CA004') return { httpStatus: 422, body: { error: e.message, code: 'cross_org_reference', message: 'This references an account, program, bill/invoice, or constituent that belongs to a different organization, or the wrong role.' } };
  if (e.code === '23514' || e.code === '23503') return { httpStatus: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  return null;
}

const SIDES = {
  bill: {
    kind: 'bill-credit-notes', table: 'org_bill_credit_notes', originalCol: 'original_bill_id', apAccountFn: 'org_get_or_create_ap_account',
    parentTable: 'org_bills', noun: 'bill', refreshStatus: refreshBillStatusAfterCredit, lockPrefix: 'bill:', source: 'bill_approval',
    totalSql: 'SELECT COALESCE(SUM(amount_cents), 0) FROM org_bill_lines WHERE bill_id = p.id',
  },
  invoice: {
    kind: 'invoice-credit-notes', table: 'org_invoice_credit_notes', originalCol: 'original_invoice_id', arAccountFn: 'org_get_or_create_ar_account',
    parentTable: 'org_invoices', noun: 'invoice', refreshStatus: refreshInvoiceStatusAfterCredit, lockPrefix: 'invoice:', source: 'invoice',
    totalSql: 'SELECT COALESCE(SUM(ROUND(quantity * unit_amount_cents)), 0) FROM org_invoice_lines WHERE invoice_id = p.id',
  },
};

const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };

async function withLock(ctx, side, id, fn) {
  const r = await ctx.pool.query(`SELECT ${side.originalCol} AS original_id FROM ${side.table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, ctx.orgId]);
  const original = r.rows[0] && r.rows[0].original_id;
  const key = original ? side.lockPrefix + original : 'credit-note:' + side.kind + ':' + id;
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } catch (e) {
    const translated = translateCreditNoteWriteError(e);
    if (translated) return translated;
    throw e;
  } finally { await lock.release(); }
}

for (const [name, side] of Object.entries(SIDES)) {
  const { table, originalCol, parentTable, totalSql, noun, refreshStatus } = side;
  const idOnly = (b) => { const id = posInt(b.id); return id ? { value: { id, b } } : { error: 'Invalid id' }; };

  defineTool({
    name: `${name}_credit_note.apply`,
    capability: 'post',
    nonHuman: 'propose',
    validate: idOnly,
    run: (ctx, { id }) => withLock(ctx, side, id, async () => {
      const { pool, orgId, userId } = ctx;
      const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
      if (!r.rows.length) return { httpStatus: 404, body: { error: 'Credit note not found' } };
      const note = r.rows[0];
      if (note.status !== 'draft') return { httpStatus: 409, body: { error: `Credit note is not in draft status (status: ${note.status})`, code: 'not_draft' } };
      if (note[originalCol]) {
        const owed = await pool.query(
          `SELECT (${totalSql}) - COALESCE((SELECT SUM(amount_cents) FROM ${table} WHERE ${originalCol} = p.id AND status = 'applied'), 0) AS left_cents
             FROM ${parentTable} p WHERE p.id = $1 AND p.org_id = $2`, [note[originalCol], orgId]);
        if (owed.rows.length && Number(note.amount_cents) > Number(owed.rows[0].left_cents)) {
          return { httpStatus: 409, body: { error: 'The credit note is more than what is left on the ' + noun + ' after other credit notes.', code: 'exceeds_balance' } };
        }
      }
      const contraAccountR = await pool.query(`SELECT ${side.apAccountFn || side.arAccountFn}($1) AS id`, [orgId]);
      const contraAccountId = contraAccountR.rows[0].id;
      const contactR = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1', [note.constituent_id]);
      const amount = Number(note.amount_cents);
      const own = { account_id: note.account_id, program_id: note.program_id, line_memo: `Credit note #${note.id}: ${note.reason || ''}` };
      const contra = { account_id: contraAccountId, program_id: note.program_id, line_memo: `Credit note #${note.id}` };
      const lines = side.apAccountFn
        ? [{ ...contra, debit_cents: amount, credit_cents: 0 }, { ...own, debit_cents: 0, credit_cents: amount }]
        : [{ ...own, debit_cents: amount, credit_cents: 0 }, { ...contra, debit_cents: 0, credit_cents: amount }];
      const postResult = await postLedgerTransaction(pool, {
        orgId, userId,
        transactionDate: note.note_date || new Date().toISOString().slice(0, 10),
        memo: `Credit note #${note.id}`,
        payee: contactR.rows[0] ? contactR.rows[0].display_name : null,
        referenceNumber: null, lines, source: side.source, constituentId: note.constituent_id,
      });
      if (postResult.httpStatus >= 400) return postResult;
      await pool.query(`UPDATE ${table} SET status = 'applied', ledger_transaction_id = $1 WHERE id = $2 AND org_id = $3`, [postResult.body.id, id, orgId]);
      if (note[originalCol]) await refreshStatus(pool, orgId, note[originalCol]);
      return { httpStatus: 200, body: { id, status: 'applied', ledger_transaction_id: postResult.body.id } };
    }),
  });

  defineTool({
    name: `${name}_credit_note.void`,
    capability: 'post',
    nonHuman: 'propose',
    validate: (b) => { const id = posInt(b.id); return id ? { value: { id, reason: b.reason != null ? String(b.reason).trim() : '' } } : { error: 'Invalid id' }; },
    run: (ctx, { id, reason }) => withLock(ctx, side, id, async () => {
      const { pool, orgId, userId } = ctx;
      const r = await pool.query(`SELECT status, ledger_transaction_id, ${originalCol} AS original_id FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
      if (!r.rows.length) return { httpStatus: 404, body: { error: 'Credit note not found' } };
      const { status, ledger_transaction_id: txnId } = r.rows[0];
      if (status === 'void') return { httpStatus: 409, body: { error: 'This credit note is already void.', code: 'already_void' } };
      if (status === 'applied') {
        if (!reason) return { httpStatus: 400, body: { error: 'A reason is required to void an applied credit note.', code: 'reason_required' } };
        const v = await voidLedgerTransaction(pool, { orgId, userId, transactionId: txnId, voidReason: `Credit note #${id} voided: ${reason}` });
        if (v.httpStatus >= 400) return v;
      }
      await pool.query(`UPDATE ${table} SET status = 'void' WHERE id = $1 AND org_id = $2`, [id, orgId]);
      if (status === 'applied' && r.rows[0].original_id) await refreshStatus(pool, orgId, r.rows[0].original_id);
      return { httpStatus: 200, body: { id, status: 'void' } };
    }),
  });

  defineTool({
    name: `${name}_credit_note.update`,
    capability: 'write',
    nonHuman: 'propose',
    validate: idOnly,
    run: (ctx, { id, b: body }) => withLock(ctx, side, id, async () => {
      const { pool, orgId, userId } = ctx;
      const r = await pool.query(`SELECT * FROM ${table} WHERE id = $1 AND org_id = $2 LIMIT 1`, [id, orgId]);
      if (!r.rows.length) return { httpStatus: 404, body: { error: 'Credit note not found' } };
      const note = r.rows[0];
      if (note.status === 'void') return { httpStatus: 409, body: { error: 'A voided credit note cannot be changed.', code: 'already_void' } };
      const applied = note.status === 'applied';
      const changeReason = body.change_reason != null ? String(body.change_reason).trim() : '';
      if (applied) {
        const blocked = ['amount_cents', 'date', 'constituent_id', originalCol].filter((k) => k in body && String(body[k] ?? '') !== String(k === 'date' ? String(note.note_date || '').slice(0, 10) : (k === 'amount_cents' ? note.amount_cents : note[k === originalCol ? originalCol : k] ?? '')));
        if (blocked.length) return { httpStatus: 409, body: { error: 'The amount, date, contact and linked ' + noun + ' of an applied credit note cannot change. Void it and enter a new one.', code: 'applied_locked' } };
        if (!changeReason) return { httpStatus: 400, body: { error: 'A reason for the change is required.', code: 'reason_required' } };
      }
      const next = {
        account_id: body.account_id != null ? Number.parseInt(String(body.account_id), 10) : note.account_id,
        program_id: body.program_id != null ? Number.parseInt(String(body.program_id), 10) : note.program_id,
        amount_cents: body.amount_cents != null ? Number.parseInt(String(body.amount_cents), 10) : Number(note.amount_cents),
        note_date: body.date != null ? String(body.date) : String(note.note_date || '').slice(0, 10),
        reason: body.reason !== undefined ? (String(body.reason || '').trim() || null) : note.reason,
        original: body[originalCol] !== undefined ? (body[originalCol] === null || body[originalCol] === '' ? null : Number.parseInt(String(body[originalCol]), 10)) : note[originalCol],
      };
      const bad = (error) => ({ httpStatus: 400, body: { error } });
      if (!Number.isInteger(next.account_id) || next.account_id < 1 || !Number.isInteger(next.program_id) || next.program_id < 1) return bad('Account and program are required.');
      if (!Number.isInteger(next.amount_cents) || next.amount_cents <= 0) return bad('amount_cents must be a positive integer');
      if (!DATE_RE.test(next.note_date)) return bad('date must be YYYY-MM-DD');
      if (next.original != null) {
        const p = await pool.query(`SELECT constituent_id, (${totalSql}) AS total_cents FROM ${parentTable} p WHERE p.id = $1 AND p.org_id = $2`, [next.original, orgId]);
        if (!p.rows.length) return { httpStatus: 404, body: { error: 'The ' + noun + ' was not found' } };
        if (Number(p.rows[0].constituent_id) !== Number(note.constituent_id)) return bad('The credit note must be for the same contact as the ' + noun + '.');
        if (next.amount_cents > Number(p.rows[0].total_cents)) return bad('The credit note cannot be more than the ' + noun + ' total.');
      }
      const fiscalYear = fiscalYearForDate(next.note_date, await getFiscalYearEndMonth(pool, orgId));
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
          fields: diffFields(note, { account_id: next.account_id, program_id: next.program_id, reason: next.reason }, ['account_id', 'program_id', 'reason']), metadata: { ...ctx.meta, change_reason: changeReason } }).catch(() => {});
      }
      return { httpStatus: 200, body: { id, status: note.status } };
    }),
  });
}

module.exports = { translateCreditNoteWriteError };
