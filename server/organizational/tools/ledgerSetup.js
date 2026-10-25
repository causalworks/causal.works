'use strict';

// Tools that post entries made outside a bill, invoice or bank line: conversion balances and board designation transfers.

const { defineTool } = require('./registry');
const { postLedgerTransaction, voidLedgerTransaction } = require('../lib/ledgerPosting');
const { acquireDocumentLock } = require('../lib/documentLock');
const { loadAccounts, currentRow, BALANCING_MEMO } = require('../lib/conversionBalances');
const { getFiscalYearEndMonth, fiscalYearForDate } = require('../lib/fiscalYear');
const { netAssetsByClass, netAssetBuckets } = require('../lib/restrictedNetAssets');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const bad = (error) => ({ httpStatus: 400, body: { error } });

async function locked(ctx, key, fn) {
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } finally { await lock.release(); }
}

defineTool({
  name: 'conversion_balances.save',
  capability: 'post',
  nonHuman: 'propose',
  validate: (body) => {
    const date = String(body.conversion_date || '');
    if (!DATE_RE.test(date)) return { error: 'Pick the conversion date.' };
    const programId = Number.parseInt(String(body.program_id), 10);
    if (!Number.isInteger(programId)) return { error: 'Pick a program for these lines.' };
    return { value: { date, programId, src: Array.isArray(body.lines) ? body.lines : [], balancingAccountId: body.balancing_account_id } };
  },
  run: (ctx, v) => locked(ctx, 'conversion-balances:' + ctx.orgId, async () => {
    const { pool, orgId, userId } = ctx;
    const { date, programId, src } = v;
    const row = await currentRow(pool, orgId);
    if (row && row.status === 'locked') return { httpStatus: 409, body: { error: 'The conversion balances are locked. Unlock them to make changes.', code: 'locked' } };
    const prog = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2', [programId, orgId]);
    if (!prog.rows.length) return bad('That program was not found.');
    const accounts = new Map((await loadAccounts(pool, orgId)).map((a) => [a.id, a]));
    const lines = [];
    let debits = 0; let credits = 0;
    for (let i = 0; i < src.length; i++) {
      const l = src[i] || {};
      const accountId = Number.parseInt(String(l.account_id), 10);
      const debit = Number.parseInt(String(l.debit_cents || 0), 10);
      const credit = Number.parseInt(String(l.credit_cents || 0), 10);
      if (!debit && !credit) continue;
      const a = accounts.get(accountId);
      if (!a) return bad(`Line ${i + 1}: that account cannot hold a conversion balance.`);
      if (a.excluded_reason) return bad(`${a.name}: ${a.excluded_reason}`);
      if (!Number.isInteger(debit) || !Number.isInteger(credit) || debit < 0 || credit < 0 || (debit > 0 && credit > 0)) {
        return bad(`${a.name}: enter either a debit or a credit amount.`);
      }
      debits += debit; credits += credit;
      lines.push({ account_id: accountId, program_id: programId, debit_cents: debit, credit_cents: credit });
    }
    if (!lines.length) return bad('Enter at least one balance.');
    const diff = debits - credits;
    let balancingId = null;
    if (diff !== 0) {
      balancingId = Number.parseInt(String(v.balancingAccountId), 10);
      const b = accounts.get(balancingId);
      if (!b || b.type !== 'equity') return bad('The balances differ by ' + (Math.abs(diff) / 100).toFixed(2) + '. Pick the net assets account that takes the difference.');
      lines.push({ account_id: balancingId, program_id: programId, debit_cents: diff < 0 ? -diff : 0, credit_cents: diff > 0 ? diff : 0, line_memo: BALANCING_MEMO });
    }
    const posted = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: date, memo: 'Conversion balances as of ' + date, payee: null, referenceNumber: null,
      lines, source: 'conversion_balance', entryType: 'journal', journalReason: 'Conversion balances entered at setup',
    });
    if (posted.httpStatus >= 400) return posted;
    if (row && row.ledger_transaction_id) {
      const vd = await voidLedgerTransaction(pool, { orgId, userId, transactionId: row.ledger_transaction_id, voidReason: 'Conversion balances re-entered' });
      if (vd.httpStatus >= 400 && vd.body && vd.body.code !== 'already_voided') {
        await voidLedgerTransaction(pool, { orgId, userId, transactionId: posted.body.id, voidReason: 'Replacement could not be completed' });
        return vd;
      }
    }
    if (row) {
      await pool.query(
        `UPDATE org_conversion_balances SET conversion_date = $2, program_id = $3, balancing_account_id = $4, ledger_transaction_id = $5, entered_by = $6, updated_at = NOW() WHERE org_id = $1`,
        [orgId, date, programId, balancingId, posted.body.id, userId]);
    } else {
      await pool.query(
        `INSERT INTO org_conversion_balances (org_id, conversion_date, program_id, balancing_account_id, ledger_transaction_id, entered_by) VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgId, date, programId, balancingId, posted.body.id, userId]);
    }
    logAudit(pool, { orgId, userId, action: row ? 'update' : 'create', tableName: 'org_conversion_balances', recordId: orgId,
      fields: [{ fieldName: 'conversion_date', oldValue: row ? String(row.conversion_date).slice(0, 10) : '(none)', newValue: date }],
      metadata: { ...ctx.meta, ledger_transaction_id: posted.body.id } }).catch(() => {});
    return { httpStatus: 200, body: { ledger_transaction_id: posted.body.id, status: 'open' } };
  }),
});

defineTool({
  name: 'board_designation.transfer',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const designationId = Number.parseInt(String(b.id), 10);
    if (!Number.isInteger(designationId) || designationId < 1) return { error: 'invalid designation id' };
    const direction = String(b.direction || '');
    const amountCents = Number.parseInt(String(b.amount_cents), 10);
    const fromId = Number.parseInt(String(b.undesignated_account_id), 10);
    const toId = Number.parseInt(String(b.designated_account_id), 10);
    const date = String(b.transaction_date || '');
    if (!['designate', 'release'].includes(direction)) return { error: 'direction must be designate or release' };
    if (!Number.isInteger(amountCents) || amountCents < 1) return { error: 'amount_cents must be a positive integer' };
    if (!Number.isInteger(fromId) || !Number.isInteger(toId) || fromId === toId) return { error: 'Choose one undesignated and one designated net assets account' };
    if (!DATE_RE.test(date)) return { error: 'transaction_date must be YYYY-MM-DD' };
    return { value: { designationId, direction, amountCents, fromId, toId, date, memo: String(b.memo || '').trim() } };
  },
  run: (ctx, v) => locked(ctx, 'board-designations:' + ctx.orgId, async () => {
    const { pool, orgId, userId } = ctx;
    const { designationId, direction, amountCents, fromId, toId, date } = v;
    const d = await pool.query('SELECT id, name FROM org_board_designations WHERE id = $1 AND org_id = $2', [designationId, orgId]);
    if (!d.rows.length) return { httpStatus: 404, body: { error: 'Board designation not found' } };
    const accts = await pool.query(
      `SELECT id FROM org_accounts WHERE org_id = $1 AND id = ANY($2::int[]) AND type = 'equity' AND is_posting = true`, [orgId, [fromId, toId]]);
    if (accts.rows.length !== 2) return bad('Both accounts must be net assets (equity) accounts you can post to');
    const prog = await pool.query(`SELECT id FROM org_programs WHERE org_id = $1 AND active = true ORDER BY is_default DESC, id LIMIT 1`, [orgId]);
    if (!prog.rows.length) return bad('The workspace has no program to post this entry to');

    const fy = fiscalYearForDate(date, await getFiscalYearEndMonth(pool, orgId));
    const designated = await pool.query(
      `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents
       FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
       WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2 AND l.board_designation_id IS NOT NULL`, [orgId, fy]);
    const mine = await pool.query(
      `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS cents
       FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
       WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2 AND l.board_designation_id = $3`, [orgId, fy, designationId]);
    if (direction === 'release' && amountCents > Number(mine.rows[0].cents)) {
      return { httpStatus: 422, body: { error: 'The release is larger than this designation\'s balance', code: 'release_exceeds_balance' } };
    }
    if (direction === 'designate') {
      const buckets = netAssetBuckets(await netAssetsByClass(pool, orgId, { throughFiscalYear: fy }));
      const available = buckets.without_restrictions - Number(designated.rows[0].cents);
      if (amountCents > available) {
        return { httpStatus: 422, body: { error: 'The amount is larger than the undesignated net assets without donor restrictions available', code: 'designation_exceeds_available', available_cents: available } };
      }
    }
    const programId = prog.rows[0].id;
    const designate = direction === 'designate';
    return postLedgerTransaction(pool, {
      orgId, userId, transactionDate: date,
      memo: v.memo || ((designate ? 'Designate net assets: ' : 'Release designated net assets: ') + d.rows[0].name),
      source: 'manual', entryType: 'transfer', internalApproval: null,
      lines: [
        { account_id: fromId, program_id: programId, ...(designate ? { debit_cents: amountCents } : { credit_cents: amountCents }) },
        { account_id: toId, program_id: programId, board_designation_id: designationId, ...(designate ? { credit_cents: amountCents } : { debit_cents: amountCents }) },
      ],
    });
  }),
});
