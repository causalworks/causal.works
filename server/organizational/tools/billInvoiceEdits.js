'use strict';

// Tools that edit a bill or an invoice: everything before it is posted, and the due date, reference and line coding after, which also corrects the posted entry.

const { defineTool, scopeAllows } = require('./registry');
const { acquireDocumentLock } = require('../lib/documentLock');
const { isFiscalYearLocked } = require('../lib/ledgerPosting');
const { translateBillWriteError, translateInvoiceWriteError } = require('../lib/documentWriteErrors');
const { parseBillLines, replaceBillLines, parseInvoiceLines, replaceInvoiceLines, BILL_LINES_SELECT, INVOICE_LINES_SELECT } = require('../lib/documentLines');
const { logAudit, diffFields } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const resp = (httpStatus, body) => ({ httpStatus, body });

const BILL_FULL_EDIT_STATUSES = new Set(['draft', 'pending_approval']);
const BILL_METADATA_ONLY_STATUSES = new Set(['approved', 'scheduled', 'partially_paid', 'paid']);
const BILL_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference', 'procurement_rationale', 'lines', 'reason']);
const INVOICE_FULL_EDIT_STATUSES = new Set(['draft']);
const INVOICE_METADATA_ONLY_STATUSES = new Set(['sent', 'partially_paid', 'paid', 'overdue']);
const INVOICE_METADATA_ONLY_FIELDS = new Set(['due_date', 'reference', 'lines', 'reason']);

function validateId(b) {
  const id = Number.parseInt(String(b.id), 10);
  const { id: _id, ...body } = b;
  return Number.isInteger(id) && id >= 1 ? { value: { id, body } } : { error: 'Invalid id' };
}

async function locked(key, ctx, fn) {
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } finally { await lock.release(); }
}

defineTool({
  name: 'bill.update',
  capability: 'post',
  nonHuman: 'propose',
  validate: validateId,
  run: (ctx, { id, body }) => locked('bill:' + id, ctx, () => updateBill(ctx, id, body)),
});

defineTool({
  name: 'invoice.update',
  capability: 'post',
  nonHuman: 'propose',
  validate: validateId,
  run: (ctx, { id, body }) => locked('invoice:' + id, ctx, () => updateInvoice(ctx, id, body)),
});

async function updateBill(ctx, billId, body) {
  const { pool, orgId, userId } = ctx;
  const LINES_SELECT = BILL_LINES_SELECT;
  const replaceLines = replaceBillLines;

  const existing = await pool.query('SELECT * FROM org_bills WHERE id = $1 AND org_id = $2 LIMIT 1', [billId, orgId]);
  if (!existing.rows.length) return resp(404, { error: 'Bill not found' });
  const bill = existing.rows[0];

  const existingLinePrograms = (await pool.query('SELECT program_id FROM org_bill_lines WHERE bill_id = $1', [billId])).rows.map((r) => r.program_id);
  if (existingLinePrograms.length === 0 && ctx.programScope !== null && ctx.programScope !== undefined) {
    return resp(404, { error: 'Bill not found' });
  }

  const isFullEdit = BILL_FULL_EDIT_STATUSES.has(bill.status);
  const isMetadataOnly = BILL_METADATA_ONLY_STATUSES.has(bill.status);
  if (!isFullEdit && !isMetadataOnly) {
    return resp(409, { error: `Bill cannot be edited in status ${bill.status}`, code: 'not_editable' });
  }
  if (isMetadataOnly) {
    const requestedFields = Object.keys(body);
    const disallowed = requestedFields.filter((f) => !BILL_METADATA_ONLY_FIELDS.has(f));
    if (disallowed.length > 0) {
      return resp(409, {
        error: `Once approved, only the due date, reference, procurement rationale and each line's account, program, grant and description can be edited here. To change ${disallowed.join(', ')}, enter a vendor credit note.`,
        code: 'requires_credit_note',
      });
    }
  }

  let parsedLines = null;
  if (isFullEdit && body.lines !== undefined) {
    const parsed = parseBillLines(body.lines);
    if (parsed.error) return resp(400, { error: parsed.error });
    parsedLines = parsed.parsedLines;
    if (!scopeAllows(ctx, parsedLines.map((l) => l.programId))) {
      return resp(403, { error: 'You do not have access to set lines outside your granted program(s).' });
    }
  } else if (!scopeAllows(ctx, existingLinePrograms)) {
    return resp(403, { error: 'You do not have access to edit this bill.' });
  }

  const dueDate = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : bill.due_date;
  if (dueDate && !DATE_RE.test(dueDate)) return resp(400, { error: 'due_date must be YYYY-MM-DD' });

  const nextConstituentId = isFullEdit && body.constituent_id !== undefined
    ? Number.parseInt(String(body.constituent_id), 10) : bill.constituent_id;
  const nextReference = body.reference !== undefined ? (body.reference ? String(body.reference) : null) : bill.reference;
  const nextNumber = isFullEdit && body.bill_number !== undefined ? (String(body.bill_number || '').trim() || bill.bill_number) : bill.bill_number;
  const nextRationale = body.procurement_rationale !== undefined ? (body.procurement_rationale ? String(body.procurement_rationale) : null) : bill.procurement_rationale;

  let posted = null;
  if (isMetadataOnly && Array.isArray(body.lines) && body.lines.length) {
    const reason = body.reason != null ? String(body.reason).trim() : '';
    if (!reason) return resp(400, { error: 'A reason is required to change an approved bill.', code: 'reason_required' });
    if (!bill.ledger_transaction_id) return resp(409, { error: 'This bill has no ledger entry to update.', code: 'not_editable' });
    const tR = await pool.query('SELECT id, fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [bill.ledger_transaction_id, orgId]);
    const txn = tR.rows[0];
    if (!txn || txn.status !== 'posted') return resp(409, { error: 'This bill\'s ledger entry is not posted, so it cannot be edited here.', code: 'not_editable' });
    if (await isFiscalYearLocked(pool, orgId, txn.fiscal_year)) {
      return resp(409, { error: 'Fiscal year ' + txn.fiscal_year + ' is locked. Enter a vendor credit note to correct this bill.', code: 'fiscal_year_locked' });
    }
    const billLines = (await pool.query(LINES_SELECT, [billId])).rows;
    const ledgerRows = (await pool.query(
      `SELECT id, account_id, program_id, grant_id, debit_cents, credit_cents, line_memo, donor_restriction_class::text AS restriction, source_line_type, source_line_id
         FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [txn.id])).rows;
    const linkedLedger = new Map(ledgerRows.filter((r) => r.source_line_type === 'org_bill_lines').map((r) => [r.source_line_id, r]));
    const apRow = ledgerRows.find((r) => !r.source_line_type && Number(r.credit_cents) > 0);
    const matches = !!apRow && ledgerRows.length === billLines.length + 1
      && billLines.every((bl) => linkedLedger.has(bl.id) && Number(linkedLedger.get(bl.id).debit_cents) === Number(bl.amount_cents));
    if (!matches) return resp(409, { error: 'This bill\'s ledger entry no longer matches its lines (it was changed elsewhere), so it cannot be edited here safely.', code: 'ledger_mismatch' });

    const edits = [];
    for (const raw of body.lines) {
      const idx = billLines.findIndex((bl) => bl.id === Number.parseInt(String(raw && raw.id), 10));
      if (idx < 0) return resp(400, { error: 'line ' + (raw && raw.id) + ' is not on this bill' });
      const old = billLines[idx];
      if (raw.amount_cents !== undefined && Number(raw.amount_cents) !== Number(old.amount_cents)) {
        return resp(409, { error: 'Amounts cannot change after approval. Enter a vendor credit note.', code: 'requires_credit_note' });
      }
      const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
      const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
      const grantId = raw.grant_id !== undefined ? (raw.grant_id == null || raw.grant_id === '' ? null : Number.parseInt(String(raw.grant_id), 10)) : old.grant_id;
      if (!(accountId > 0) || !(programId > 0) || (grantId != null && !(grantId > 0))) return resp(400, { error: 'account, program and grant must be ids' });
      const lineMemo = raw.line_memo !== undefined ? (raw.line_memo == null ? null : String(raw.line_memo).trim() || null) : old.line_memo;
      edits.push({ idx, old, ledger: linkedLedger.get(old.id), accountId, programId, grantId, lineMemo, grantChanged: grantId !== old.grant_id });
    }
    const finalPrograms = billLines.map((bl, i) => (edits.find((e) => e.idx === i) || { programId: bl.program_id }).programId);
    if (!scopeAllows(ctx, finalPrograms)) return resp(403, { error: 'You do not have access to set lines outside your granted program(s).' });

    const newGrantIds = [...new Set(edits.filter((e) => e.grantChanged && e.grantId != null).map((e) => e.grantId))];
    const grantById = new Map();
    if (newGrantIds.length) {
      const gR = await pool.query('SELECT id, is_federal_award, donor_restriction_class::text AS donor_restriction_class FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])', [orgId, newGrantIds]);
      gR.rows.forEach((g) => grantById.set(g.id, g));
      for (const e of edits) {
        if (!e.grantChanged || e.grantId == null) continue;
        const g = grantById.get(e.grantId);
        if (!g) return resp(422, { error: 'That grant was not found.', code: 'cross_org_reference' });
        if (g.is_federal_award) return resp(422, { error: 'A federal-award grant needs sign-off from a second person. Enter a vendor credit note and a corrected bill.', code: 'federal_award_needs_new_entry' });
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
      const meta = { ...ctx.meta, reason: posted.reason };
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields: posted.fields, metadata: meta }).catch(() => {});
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: posted.txn.id, fields: posted.fields, metadata: { reason: posted.reason } }).catch(() => {});
    }

    if (isMetadataOnly) {
      const fields = diffFields(bill, { due_date: dueDate, reference: nextReference, procurement_rationale: nextRationale }, ['due_date', 'reference', 'procurement_rationale']);
      if (fields.length > 0) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_bills', recordId: billId, fields, metadata: ctx.meta }).catch(() => {});
      }
    }

    return resp(200, { id: billId, status: bill.status });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const translated = translateBillWriteError(e);
    if (translated) return resp(translated.status, translated.body);
    throw e;
  } finally {
    client.release();
  }
}

async function updateInvoice(ctx, invoiceId, body) {
  const { pool, orgId, userId } = ctx;
  const LINES_SELECT = INVOICE_LINES_SELECT;
  const replaceLines = replaceInvoiceLines;

  const existing = await pool.query('SELECT * FROM org_invoices WHERE id = $1 AND org_id = $2 LIMIT 1', [invoiceId, orgId]);
  if (!existing.rows.length) return resp(404, { error: 'Invoice not found' });
  const invoice = existing.rows[0];

  const existingLinePrograms = (await pool.query('SELECT program_id FROM org_invoice_lines WHERE invoice_id = $1', [invoiceId])).rows.map((r) => r.program_id);
  if (existingLinePrograms.length === 0 && ctx.programScope !== null && ctx.programScope !== undefined) {
    return resp(404, { error: 'Invoice not found' });
  }

  const isFullEdit = INVOICE_FULL_EDIT_STATUSES.has(invoice.status);
  const isMetadataOnly = INVOICE_METADATA_ONLY_STATUSES.has(invoice.status);
  if (!isFullEdit && !isMetadataOnly) {
    return resp(409, { error: `Invoice cannot be edited in status ${invoice.status}`, code: 'not_editable' });
  }
  if (isMetadataOnly) {
    const requestedFields = Object.keys(body);
    const disallowed = requestedFields.filter((f) => !INVOICE_METADATA_ONLY_FIELDS.has(f));
    if (disallowed.length > 0) {
      return resp(409, {
        error: `Once sent, only the due date, reference and each line's account, program and description can be edited here. To change ${disallowed.join(', ')}, revert the invoice to draft or enter a customer credit note.`,
        code: 'requires_credit_note',
      });
    }
  }

  let parsedLines = null;
  if (isFullEdit && body.lines !== undefined) {
    const parsed = parseInvoiceLines(body.lines);
    if (parsed.error) return resp(400, { error: parsed.error });
    parsedLines = parsed.parsedLines;
    if (!scopeAllows(ctx, parsedLines.map((l) => l.programId))) {
      return resp(403, { error: 'You do not have access to set lines outside your granted program(s).' });
    }
  } else if (!scopeAllows(ctx, existingLinePrograms)) {
    return resp(403, { error: 'You do not have access to edit this invoice.' });
  }
  const dueDate = body.due_date !== undefined ? (body.due_date ? String(body.due_date) : null) : invoice.due_date;
  if (dueDate && !DATE_RE.test(dueDate)) return resp(400, { error: 'due_date must be YYYY-MM-DD' });

  const nextConstituentId = isFullEdit && body.constituent_id !== undefined
    ? Number.parseInt(String(body.constituent_id), 10) : invoice.constituent_id;
  const nextReference = body.reference !== undefined ? (body.reference ? String(body.reference) : null) : invoice.reference;
  const nextNumber = isFullEdit && body.invoice_number !== undefined ? (String(body.invoice_number || '').trim() || invoice.invoice_number) : invoice.invoice_number;

  let posted = null;
  if (isMetadataOnly && Array.isArray(body.lines) && body.lines.length) {
    const reason = body.reason != null ? String(body.reason).trim() : '';
    if (!reason) return resp(400, { error: 'A reason is required to change a sent invoice.', code: 'reason_required' });
    if (!invoice.ledger_transaction_id) return resp(409, { error: 'This invoice has no ledger entry to update.', code: 'not_editable' });
    const tR = await pool.query('SELECT id, fiscal_year, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [invoice.ledger_transaction_id, orgId]);
    const txn = tR.rows[0];
    if (!txn || txn.status !== 'posted') return resp(409, { error: 'This invoice\'s ledger entry is not posted, so it cannot be edited here.', code: 'not_editable' });
    if (await isFiscalYearLocked(pool, orgId, txn.fiscal_year)) {
      return resp(409, { error: 'Fiscal year ' + txn.fiscal_year + ' is locked. Enter a customer credit note to correct this invoice.', code: 'fiscal_year_locked' });
    }
    const invLines = (await pool.query(LINES_SELECT, [invoiceId])).rows;
    if (invLines.some((l) => l.fair_market_value_cents != null)) {
      return resp(409, { error: 'A line with a quid-pro-quo split cannot be edited here. Revert the invoice to draft to change it.', code: 'split_line' });
    }
    const ledgerRows = (await pool.query(
      `SELECT id, account_id, program_id, debit_cents, credit_cents, line_memo, source_line_type, source_line_id FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id`, [txn.id])).rows;
    const linkedLedger = new Map(ledgerRows.filter((r) => r.source_line_type === 'org_invoice_lines').map((r) => [r.source_line_id, r]));
    const matches = ledgerRows.length === invLines.length + 1
      && invLines.every((il) => linkedLedger.has(il.id)
        && Number(linkedLedger.get(il.id).credit_cents) === Math.round(Number(il.quantity) * Number(il.unit_amount_cents)));
    if (!matches) return resp(409, { error: 'This invoice\'s ledger entry no longer matches its lines (it was changed elsewhere), so it cannot be edited here safely.', code: 'ledger_mismatch' });

    const edits = [];
    for (const raw of body.lines) {
      const idx = invLines.findIndex((il) => il.id === Number.parseInt(String(raw && raw.id), 10));
      if (idx < 0) return resp(400, { error: 'line ' + (raw && raw.id) + ' is not on this invoice' });
      const old = invLines[idx];
      if (raw.unit_amount_cents !== undefined && Number(raw.unit_amount_cents) !== Number(old.unit_amount_cents)) {
        return resp(409, { error: 'Amounts cannot change after sending. Revert the invoice to draft or enter a customer credit note.', code: 'requires_credit_note' });
      }
      const accountId = raw.account_id !== undefined ? Number.parseInt(String(raw.account_id), 10) : old.account_id;
      const programId = raw.program_id !== undefined ? Number.parseInt(String(raw.program_id), 10) : old.program_id;
      if (!(accountId > 0) || !(programId > 0)) return resp(400, { error: 'account and program must be ids' });
      const description = raw.description !== undefined ? (raw.description == null ? null : String(raw.description).trim() || null) : old.description;
      edits.push({ idx, old, ledger: linkedLedger.get(old.id), accountId, programId, description });
    }
    const finalPrograms = invLines.map((il, i) => (edits.find((e) => e.idx === i) || { programId: il.program_id }).programId);
    if (!scopeAllows(ctx, finalPrograms)) return resp(403, { error: 'You do not have access to set lines outside your granted program(s).' });

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
      `UPDATE org_invoices SET constituent_id = $1, due_date = $2, reference = $3, invoice_number = $6, updated_at = NOW() WHERE id = $4 AND org_id = $5`,
      [nextConstituentId, dueDate, nextReference, invoiceId, orgId, nextNumber]
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
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields: posted.fields, metadata: { ...ctx.meta, reason: posted.reason } }).catch(() => {});
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: posted.txn.id, fields: posted.fields, metadata: { reason: posted.reason } }).catch(() => {});
    }

    if (isMetadataOnly) {
      const fields = diffFields(invoice, { due_date: dueDate, reference: nextReference }, ['due_date', 'reference']);
      if (fields.length > 0) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_invoices', recordId: invoiceId, fields, metadata: ctx.meta }).catch(() => {});
      }
    }

    return resp(200, { id: invoiceId, status: invoice.status });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const translated = translateInvoiceWriteError(e);
    if (translated) return resp(translated.status, translated.body);
    throw e;
  } finally {
    client.release();
  }
}
