'use strict';

// Tool that corrects a posted ledger entry: date, payee, memo, contact and the account, program, grant and restriction on its lines, within the limits of where the entry came from.

const { defineTool } = require('./registry');
const entryEdit = require('../lib/ledgerEntryEdit');
const { translateLedgerWriteError, isFiscalYearLocked, RESTRICTION_CLASSES } = require('../lib/ledgerPosting');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { syncGiftAfterRecode, suggestGiftForTransaction } = require('../lib/giftIntake');
const { acquireDocumentLock } = require('../lib/documentLock');
const { logAudit } = require('../lib/auditLog');

const { LINKED_SOURCES, isSystemAccount, isClassificationLine, isGiftAssetSide } = entryEdit;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const resp = (httpStatus, body) => ({ httpStatus, body });

defineTool({
  name: 'ledger_entry.update',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = Number.parseInt(String(b.id), 10);
    if (!Number.isInteger(id) || id < 1) return { error: 'invalid transaction id' };
    if (b.date != null && !DATE_RE.test(String(b.date))) return { error: 'date must be YYYY-MM-DD' };
    return { value: { id, body: b } };
  },
  run: async (ctx, { id, body }) => {
    const lock = await acquireDocumentLock(ctx.pool, 'ledger-entry:' + id);
    try { return await update(ctx, id, body); } finally { await lock.release(); }
  },
});

defineTool({
  name: 'ledger_entry.approve',
  capability: 'approve',
  nonHuman: 'propose',
  validate: (b) => {
    const id = Number.parseInt(String(b.id), 10);
    return Number.isInteger(id) && id >= 1 ? { value: { id } } : { error: 'invalid transaction id' };
  },
  run: async (ctx, { id }) => {
    const { pool, orgId, userId } = ctx;
    const lock = await acquireDocumentLock(pool, 'ledger-entry:' + id);
    try {
      const existing = await pool.query('SELECT id, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [id, orgId]);
      if (existing.rows.length === 0) return resp(404, { error: 'Transaction not found' });
      if (existing.rows[0].status !== 'pending_approval') {
        return resp(409, { error: `Transaction is not awaiting approval (status: ${existing.rows[0].status})`, code: 'not_pending_approval' });
      }
      try {
        await pool.query(`UPDATE org_ledger_transactions SET status = 'posted', approved_by = $1, approved_at = NOW() WHERE id = $2 AND org_id = $3`, [userId, id, orgId]);
      } catch (e) {
        const translated = translateLedgerWriteError(e);
        if (translated) return resp(translated.status, translated.body);
        throw e;
      }
      try { await suggestGiftForTransaction(pool, { orgId, userId, transactionId: id }); } catch (e) { console.error('suggest gift after approval:', e.message); }
      return resp(200, { id, status: 'posted' });
    } finally { await lock.release(); }
  },
});

async function update(ctx, id, body) {
  const { pool, orgId, userId } = ctx;
  const reason = body.reason != null ? String(body.reason).trim() : '';
  const tR = await pool.query(
    `SELECT t.id, t.transaction_date, t.fiscal_year, t.status, t.memo, t.payee, t.reference_number, t.source, t.constituent_id
       FROM org_ledger_transactions t WHERE t.org_id = $1 AND t.id = $2`, [orgId, id]);
  const t = tR.rows[0];
  if (!t) return resp(404, { error: 'Transaction not found' });
  if (!reason) return resp(400, { error: 'A reason is required to change an entry.', code: 'reason_required' });
  const linesR = await pool.query(
    `SELECT id, account_id, program_id, grant_id, donor_restriction_class::text AS restriction, line_memo, source_line_type, source_line_id, debit_cents, credit_cents
       FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [id]);
  const oldLines = new Map(linesR.rows.map((l) => [l.id, l]));

  const elig = await entryEdit.editEligibility(pool, orgId, id, t.source, t.status, t.fiscal_year, []);
  if (!elig.allowed) return resp(409, { error: elig.reason, code: 'not_editable' });
  if (elig.memo_only) {
    const lineSent = Array.isArray(body.lines) && body.lines.length > 0;
    const dateSent = body.date != null && String(body.date) !== String(t.transaction_date).slice(0, 10);
    const payeeSent = body.payee !== undefined && (body.payee == null ? null : String(body.payee).trim() || null) !== t.payee;
    const contactSent = body.constituent_id !== undefined && ((body.constituent_id == null || body.constituent_id === '') ? null : Number(body.constituent_id)) !== (t.constituent_id == null ? null : Number(t.constituent_id));
    if (lineSent || dateSent || payeeSent || contactSent) {
      return resp(409, { error: 'This entry is voided. Only its memo and reference can change.', code: 'memo_only' });
    }
  }
  let acctFacts = new Map();
  if (elig.limited) {
    const wantedIds = new Set(linesR.rows.map((l) => l.account_id));
    for (const raw of Array.isArray(body.lines) ? body.lines : []) {
      const n = Number.parseInt(String(raw && raw.account_id), 10);
      if (n > 0) wantedIds.add(n);
    }
    acctFacts = await entryEdit.accountFacts(pool, orgId, [...wantedIds]);
    const stay = (what) => resp(409, {
      error: 'This entry was created by ' + elig.source_label + ', so the date, payee and contact are changed there (' + what + ' was sent). You can correct the account, program and grant on its income and expense lines, and every description, its memo and its reference.',
      code: 'limited_edit' });
    if (body.date != null && String(body.date) !== String(t.transaction_date).slice(0, 10)) return stay('date');
    if (body.payee !== undefined && (body.payee == null ? null : String(body.payee).trim() || null) !== t.payee) return stay('payee');
    if (body.constituent_id !== undefined && ((body.constituent_id == null || body.constituent_id === '') ? null : Number(body.constituent_id)) !== (t.constituent_id == null ? null : Number(t.constituent_id))) return stay('contact');
  }

  const oldDate = String(t.transaction_date).slice(0, 10);
  const newDate = body.date != null ? String(body.date) : oldDate;
  const str = (k, cur) => (body[k] !== undefined ? (body[k] == null ? null : String(body[k]).trim() || null) : cur);
  const newPayee = str('payee', t.payee);
  const newMemo = str('memo', t.memo);
  const newRef = str('reference', t.reference_number);
  let newContact = t.constituent_id;
  if (body.constituent_id !== undefined) {
    newContact = body.constituent_id == null || body.constituent_id === '' ? null : Number.parseInt(String(body.constituent_id), 10);
    if (newContact != null && !(newContact > 0)) return resp(400, { error: 'constituent_id must be a number' });
  }

  let newFy = t.fiscal_year;
  if (newDate !== oldDate) {
    if (elig.reconciled) return resp(409, { error: 'This entry is reconciled to a bank line, so its date cannot change. Unreconcile it first.', code: 'reconciled_date' });
    newFy = fiscalYearForDate(newDate, await getFiscalYearEndMonth(pool, orgId));
    if (newFy !== t.fiscal_year && await isFiscalYearLocked(pool, orgId, newFy)) {
      return resp(409, { error: 'Fiscal year ' + newFy + ' is locked.', code: 'fiscal_year_locked' });
    }
  }

  const lineEdits = [];
  for (const raw of Array.isArray(body.lines) ? body.lines : []) {
    const lineId = Number.parseInt(String(raw && raw.id), 10);
    const old = oldLines.get(lineId);
    if (!old) return resp(400, { error: 'line ' + raw.id + ' is not on this entry' });
    const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
    const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
    const grantId = raw.grant_id !== undefined ? (raw.grant_id == null || raw.grant_id === '' ? null : Number.parseInt(String(raw.grant_id), 10)) : old.grant_id;
    if (!(accountId > 0) || !(programId > 0) || (grantId != null && !(grantId > 0))) return resp(400, { error: 'account, program and grant must be ids' });
    if (raw.donor_restriction_class != null && raw.donor_restriction_class !== '' && !RESTRICTION_CLASSES.has(String(raw.donor_restriction_class))) {
      return resp(400, { error: 'donor_restriction_class is not valid' });
    }
    const lineMemo = raw.line_memo !== undefined ? (raw.line_memo == null ? null : String(raw.line_memo).trim() || null) : old.line_memo;
    if (elig.reconciled && elig.locked_account_ids.includes(old.account_id) && accountId !== old.account_id) {
      return resp(409, { error: 'The bank-side account on a reconciled entry cannot change. Unreconcile it first.', code: 'reconciled_account' });
    }
    if (elig.limited) {
      const oldFacts = acctFacts.get(old.account_id);
      const newFacts = acctFacts.get(accountId);
      const changesLine = accountId !== old.account_id || programId !== old.program_id || grantId !== old.grant_id
        || (raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '' && raw.donor_restriction_class !== old.restriction);
      if (changesLine && !isClassificationLine(oldFacts) && !isGiftAssetSide(t.source, oldFacts, old.debit_cents)) {
        return resp(409, { error: 'Line ' + (linesR.rows.findIndex((l) => l.id === lineId) + 1) + ' is a receivable, payable or bank line set by ' + elig.source_label + ' and cannot be changed here.', code: 'limited_edit' });
      }
      if (changesLine && LINKED_SOURCES[t.source] && !old.source_line_id) {
        return resp(409, { error: 'This line is not linked to its record on the ' + LINKED_SOURCES[t.source] + '. Change it there.', code: 'limited_edit' });
      }
      if (accountId !== old.account_id && old.source_line_type === 'org_gifts' && t.source !== 'gift_in_kind') {
        return resp(409, { error: 'The accounts on a gift entry are set on the gift. Program and grant can change here.', code: 'limited_edit' });
      }
      if (accountId !== old.account_id) {
        const giftCostSide = t.source === 'gift_in_kind' && Number(old.debit_cents) > 0;
        const typeOk = newFacts && (giftCostSide ? (newFacts.type === 'expense' || newFacts.type === 'asset') : newFacts.type === oldFacts.type);
        if (!newFacts || !newFacts.is_posting || isSystemAccount(newFacts) || !typeOk) {
          return resp(409, { error: giftCostSide ? 'An in-kind gift can be recorded as an expense or an asset (not cash, receivable or payable).' : 'An income line can change to another income account and an expense line to another expense account.', code: 'limited_edit' });
        }
      }
    }
    let debit = Number(old.debit_cents);
    let credit = Number(old.credit_cents);
    if (raw.debit_cents !== undefined || raw.credit_cents !== undefined) {
      debit = raw.debit_cents !== undefined ? Number(raw.debit_cents) : debit;
      credit = raw.credit_cents !== undefined ? Number(raw.credit_cents) : credit;
      if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        return resp(400, { error: 'Each line needs one positive amount, in cents.' });
      }
      if (debit !== Number(old.debit_cents) || credit !== Number(old.credit_cents)) {
        if (elig.limited || old.source_line_type) return resp(409, { error: 'Amounts on this entry are set by the record it came from. Change them there.', code: 'limited_edit' });
        if (elig.reconciled) return resp(409, { error: 'This entry is matched to a bank line, so its amounts stay as they are. Unreconcile it first.', code: 'reconciled_amount' });
      }
    }
    let restriction = old.restriction;
    if (raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '') restriction = raw.donor_restriction_class;
    lineEdits.push({ lineId, old, debit, credit, accountId, programId, grantId, lineMemo, restriction, grantChanged: grantId !== old.grant_id, restrictionGiven: raw.donor_restriction_class !== undefined && raw.donor_restriction_class !== '' });
  }

  if (lineEdits.some((e) => e.debit !== Number(e.old.debit_cents) || e.credit !== Number(e.old.credit_cents))) {
    const amt = new Map(linesR.rows.map((l) => [l.id, [Number(l.debit_cents), Number(l.credit_cents)]]));
    lineEdits.forEach((e) => amt.set(e.lineId, [e.debit, e.credit]));
    let d = 0; let c = 0;
    amt.forEach((v) => { d += v[0]; c += v[1]; });
    if (d !== c) return resp(400, { error: 'Debits and credits must be equal after the change.' });
  }

  const finalGrantIds = new Set(linesR.rows.map((l) => (lineEdits.find((e) => e.lineId === l.id) || { grantId: l.grant_id }).grantId).filter((g) => g != null));
  if (lineEdits.some((e) => e.grantChanged) && finalGrantIds.size) {
    const gR = await pool.query(`SELECT id, is_federal_award, donor_restriction_class::text AS donor_restriction_class FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, [...finalGrantIds]]);
    const gById = new Map(gR.rows.map((g) => [g.id, g]));
    for (const e of lineEdits) {
      if (!e.grantChanged || e.grantId == null) continue;
      const g = gById.get(e.grantId);
      if (!g) return resp(422, { error: 'That grant was not found.', code: 'cross_org_reference' });
      if (g.is_federal_award) return resp(422, { error: 'A federal-award grant needs sign-off from a second person. Void this entry and enter the corrected one.', code: 'federal_award_needs_new_entry' });
      if (!e.restrictionGiven && g.donor_restriction_class) e.restriction = g.donor_restriction_class;
    }
  }

  const ids = (k) => [...new Set(lineEdits.flatMap((e) => [e.old[k], e[k === 'account_id' ? 'accountId' : k === 'program_id' ? 'programId' : 'grantId']]).filter((v) => v != null))];
  const [aR, pR, gR2, cR] = await Promise.all([
    pool.query(`SELECT id, code || ' ' || name AS label FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('account_id')]),
    pool.query(`SELECT id, name AS label FROM org_programs WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('program_id')]),
    pool.query(`SELECT id, name AS label FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, ids('grant_id')]),
    pool.query(`SELECT id, display_name AS label FROM org_constituents WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, [t.constituent_id, newContact].filter((v) => v != null)]),
  ]);
  const lab = (r, id) => (id == null ? '(none)' : ((r.rows.find((x) => x.id === id) || {}).label || '#' + id));

  const fields = [];
  const addField = (fieldName, o, n) => { if ((o == null ? null : String(o)) !== (n == null ? null : String(n))) fields.push({ fieldName, oldValue: o == null ? '(none)' : o, newValue: n == null ? '(none)' : n }); };
  addField('Date', oldDate, newDate);
  addField('Payee', t.payee, newPayee);
  addField('Memo', t.memo, newMemo);
  addField('Reference', t.reference_number, newRef);
  if (newContact !== t.constituent_id) fields.push({ fieldName: 'Contact', oldValue: lab(cR, t.constituent_id), newValue: lab(cR, newContact) });
  const lineNo = new Map(linesR.rows.map((l, i) => [l.id, i + 1]));
  for (const e of lineEdits) {
    const n = 'Line ' + lineNo.get(e.lineId) + ' ';
    if (e.accountId !== e.old.account_id) fields.push({ fieldName: n + 'account', oldValue: lab(aR, e.old.account_id), newValue: lab(aR, e.accountId) });
    if (e.programId !== e.old.program_id) fields.push({ fieldName: n + 'program', oldValue: lab(pR, e.old.program_id), newValue: lab(pR, e.programId) });
    if (e.grantId !== e.old.grant_id) fields.push({ fieldName: n + 'grant', oldValue: lab(gR2, e.old.grant_id), newValue: lab(gR2, e.grantId) });
    if ((e.restriction || null) !== (e.old.restriction || null)) fields.push({ fieldName: n + 'restriction', oldValue: e.old.restriction || '(none)', newValue: e.restriction || '(none)' });
    addField(n + 'memo', e.old.line_memo, e.lineMemo);
    if (e.debit !== Number(e.old.debit_cents)) fields.push({ fieldName: n + 'debit', oldValue: (Number(e.old.debit_cents) / 100).toFixed(2), newValue: (e.debit / 100).toFixed(2) });
    if (e.credit !== Number(e.old.credit_cents)) fields.push({ fieldName: n + 'credit', oldValue: (Number(e.old.credit_cents) / 100).toFixed(2), newValue: (e.credit / 100).toFixed(2) });
  }
  if (!fields.length) return resp(400, { error: 'Nothing was changed.' });

  const sourceDocs = new Set();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE org_ledger_transactions SET transaction_date = $1, fiscal_year = $2, payee = $3, memo = $4, reference_number = $5, constituent_id = $6
        WHERE id = $7 AND org_id = $8`,
      [newDate, newFy, newPayee, newMemo, newRef, newContact, id, orgId]
    );
    for (const e of lineEdits) {
      await client.query(
        `UPDATE org_ledger_lines SET account_id = $1, program_id = $2, grant_id = $3, donor_restriction_class = $4::org_restriction_class, line_memo = $5,
                debit_cents = $8, credit_cents = $9
          WHERE id = $6 AND transaction_id = $7`,
        [e.accountId, e.programId, e.grantId, e.restriction || null, e.lineMemo, e.lineId, id, e.debit, e.credit]
      );
      const changed = e.accountId !== e.old.account_id || e.programId !== e.old.program_id || e.grantId !== e.old.grant_id || e.lineMemo !== e.old.line_memo;
      if (changed && e.old.source_line_type === 'org_bill_lines') {
        const w = await client.query(
          'UPDATE org_bill_lines SET account_id = $1, program_id = $2, grant_id = $3, line_memo = $4 WHERE id = $5 RETURNING bill_id',
          [e.accountId, e.programId, e.grantId, e.lineMemo, e.old.source_line_id]);
        if (w.rows[0]) sourceDocs.add('org_bills:' + w.rows[0].bill_id);
      } else if (changed && e.old.source_line_type === 'org_expense_claim_lines') {
        const w = await client.query(
          'UPDATE org_expense_claim_lines SET account_id = $1, program_id = $2, grant_id = $3, line_memo = $4 WHERE id = $5 RETURNING claim_id',
          [e.accountId, e.programId, e.grantId, e.lineMemo, e.old.source_line_id]);
        if (w.rows[0]) sourceDocs.add('org_expense_claims:' + w.rows[0].claim_id);
      } else if (changed && e.old.source_line_type === 'org_gifts') {
        const w = await client.query(
          'UPDATE org_gifts SET program_id = $1, grant_id = $2 WHERE id = $3 AND org_id = $4 RETURNING id',
          [e.programId, e.grantId, e.old.source_line_id, orgId]);
        if (t.source === 'gift_in_kind' && e.accountId !== e.old.account_id) {
          await client.query(
            `UPDATE org_gifts SET ${Number(e.old.debit_cents) > 0 ? 'in_kind_expense_account_id' : 'in_kind_revenue_account_id'} = $1 WHERE id = $2 AND org_id = $3`,
            [e.accountId, e.old.source_line_id, orgId]);
        }
        await client.query(
          'UPDATE org_ledger_lines SET program_id = $1, grant_id = $2 WHERE transaction_id = $3 AND source_line_type = $4 AND source_line_id = $5',
          [e.programId, e.grantId, id, 'org_gifts', e.old.source_line_id]);
        if (w.rows[0]) sourceDocs.add('org_gifts:' + w.rows[0].id);
      } else if (changed && e.old.source_line_type === 'org_invoice_lines') {
        const w = await client.query(
          'UPDATE org_invoice_lines SET account_id = $1, program_id = $2 WHERE id = $3 RETURNING invoice_id',
          [e.accountId, e.programId, e.old.source_line_id]);
        if (w.rows[0]) sourceDocs.add('org_invoices:' + w.rows[0].invoice_id);
      }
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const translated = translateLedgerWriteError(e);
    if (translated) return { httpStatus: translated.status, body: translated.body };
    throw e;
  } finally {
    client.release();
  }
  if (lineEdits.some((e) => e.accountId !== e.old.account_id)) {
    try { await syncGiftAfterRecode(pool, { orgId, userId, transactionId: id }); } catch (e) { console.error('gift sync after recode:', e.message); }
  }
  await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: id, fields, metadata: { reason } });
  for (const key of sourceDocs) {
    const [tableName, docId] = key.split(':');
    logAudit(pool, { orgId, userId, action: 'update', tableName, recordId: Number(docId), fields: [], metadata: { recoded_from_ledger_entry: id, reason } }).catch(() => {});
  }
  return resp(200, { id, changed: fields.length });
}
