'use strict';

/**
 * Shared ledger-transaction posting logic -- extracted from ledger.js (Phase 4/5) so
 * Bank Reconciliation's Create/Transfer confirm actions call the exact same code path
 * instead of a second, parallel implementation (Bank_Reconciliation_V1_Spec.md Section 1:
 * "Both views write through the same underlying confirm action -> the existing
 * ledger-posting API"). This module owns validation-shape parsing, the federal-award
 * approval gate, the DB transaction, and DB-error translation; callers own request-specific
 * input (where the lines come from) and response shaping.
 */

const { getFiscalYearEndMonth, fiscalYearForDate } = require('./fiscalYear');
const { isFiscalYearLockedError } = require('./fiscalYearLockError');
const { logAudit } = require('./auditLog');

const RESTRICTION_CLASSES = new Set(['unrestricted', 'temporarily_restricted', 'permanently_restricted']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {Error & { code?: string, constraint?: string, message: string }} e
 * @returns {{ status: number, body: { error: string, code: string, message: string } } | null}
 */
function translateLedgerWriteError(e) {
  if (isFiscalYearLockedError(e)) {
    return { status: 409, body: { error: e.message, code: 'fiscal_year_locked', message: e.message } };
  }
  if (e.code === 'CA002') {
    return {
      status: 422,
      body: { error: e.message, code: 'unbalanced', message: 'This transaction\'s debits and credits do not balance.' },
    };
  }
  if (e.code === 'CA003') {
    return {
      status: 422,
      body: {
        error: e.message,
        code: 'non_posting_account',
        message: 'One of these lines references an account that is a rollup/header account, not a postable account.',
      },
    };
  }
  if (e.code === 'CA004') {
    return {
      status: 422,
      body: {
        error: e.message,
        code: 'cross_org_reference',
        message: 'One of these lines references an account, program, or grant that belongs to a different organization.',
      },
    };
  }
  if (e.code === 'CA005') {
    return {
      status: 422,
      body: {
        error: e.message,
        code: 'self_approval_not_allowed',
        message: 'This transaction touches a federal-award grant and needs sign-off from a different user than whoever created it.',
      },
    };
  }
  if (e.code === '23514') {
    if (e.constraint === 'org_ledger_lines_exactly_one_side') {
      return {
        status: 422,
        body: {
          error: e.message,
          code: 'invalid_line_amounts',
          message: 'Each line must have either a debit or a credit amount, not both and not neither.',
        },
      };
    }
    if (e.constraint === 'org_ledger_lines_amounts_non_negative') {
      return {
        status: 422,
        body: { error: e.message, code: 'invalid_line_amounts', message: 'Debit and credit amounts must not be negative.' },
      };
    }
    return { status: 422, body: { error: e.message, code: 'validation_failed', message: e.message } };
  }
  return null;
}

/**
 * Parses+validates the request-shape of a `lines` array. Pure input-shape validation only --
 * nothing here is an accounting rule (those are DB triggers). Returns { error } (a string, for
 * a 400) or { parsedLines }.
 */
function parseLedgerLines(lines) {
  if (!Array.isArray(lines) || lines.length < 2) {
    return { error: 'lines must be an array of at least 2 entries (a transaction needs at least two sides)' };
  }
  const parsedLines = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i] || {};
    const rowNum = i + 1;
    const accountId = Number.parseInt(String(l.account_id), 10);
    const programId = Number.parseInt(String(l.program_id), 10);
    if (!Number.isInteger(accountId) || accountId < 1) return { error: `line ${rowNum}: account_id is required` };
    if (!Number.isInteger(programId) || programId < 1) return { error: `line ${rowNum}: program_id is required` };
    let grantId = null;
    if (l.grant_id != null && l.grant_id !== '') {
      grantId = Number.parseInt(String(l.grant_id), 10);
      if (!Number.isInteger(grantId) || grantId < 1) return { error: `line ${rowNum}: grant_id must be a positive integer if provided` };
    }
    let restrictionClass = null;
    if (l.donor_restriction_class != null && l.donor_restriction_class !== '') {
      restrictionClass = String(l.donor_restriction_class);
      if (!RESTRICTION_CLASSES.has(restrictionClass)) {
        return { error: `line ${rowNum}: donor_restriction_class must be one of unrestricted, temporarily_restricted, permanently_restricted` };
      }
    }
    let boardDesignationId = null;
    if (l.board_designation_id != null && l.board_designation_id !== '') {
      boardDesignationId = Number.parseInt(String(l.board_designation_id), 10);
      if (!Number.isInteger(boardDesignationId) || boardDesignationId < 1) {
        return { error: `line ${rowNum}: board_designation_id must be a positive integer if provided` };
      }
    }
    const debitCents = l.debit_cents != null ? Number.parseInt(String(l.debit_cents), 10) : 0;
    const creditCents = l.credit_cents != null ? Number.parseInt(String(l.credit_cents), 10) : 0;
    if (!Number.isInteger(debitCents) || !Number.isInteger(creditCents)) {
      return { error: `line ${rowNum}: debit_cents and credit_cents must be integers` };
    }
    parsedLines.push({
      accountId, programId, grantId, restrictionClass, boardDesignationId, debitCents, creditCents,
      lineMemo: l.line_memo != null ? String(l.line_memo) : null,
    });
  }
  return { parsedLines };
}

/**
 * Posts one ledger transaction. Resolves fiscal year, applies the federal-award approval gate
 * (Phase 5), runs the insert inside one DB transaction so the deferred balance trigger sees
 * every line before COMMIT, and translates any trigger rejection. Always returns a
 * { httpStatus, body } pair -- never throws -- so every caller (ledger.js's route,
 * bankReconciliation.js's Create/Transfer confirm actions) handles success and failure
 * identically.
 *
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, transactionDate: string, memo: string|null,
 *   payee: string|null, referenceNumber: string|null, lines: object[], source?: 'manual'|'bank_reconciliation'|'bill_approval',
 *   reversesTransactionId?: number|null, internalApproval?: { approvedBy: number, approvedAt?: string,
 *   sourceRefId: number, sourceRefType: string } }} opts
 *
 * opts.internalApproval is deliberately NOT a public API parameter -- it exists only for trusted
 * server-side callers (e.g. the Bill-approval route) that have already run their own
 * separation-of-duties check and want to skip this function's normal federal-award re-gate
 * instead of the resulting transaction being born pending_approval a second time. Never populate
 * this from request body input. When present, the bypass is still traceable, not silent: it
 * writes who/when approved (reusing the same approved_by/approved_at columns the normal gate
 * uses) and which record authorized it (source_ref_id/source_ref_type) onto the transaction.
 */
async function postLedgerTransaction(pool, opts) {
  const { orgId, userId, transactionDate, memo, payee, referenceNumber, source, reversesTransactionId, internalApproval } = opts;
  if (!transactionDate || !DATE_RE.test(transactionDate)) {
    return { httpStatus: 400, body: { error: 'transaction_date is required and must be YYYY-MM-DD' } };
  }
  const { error, parsedLines } = parseLedgerLines(opts.lines);
  if (error) return { httpStatus: 400, body: { error } };

  const grantIds = [...new Set(parsedLines.map((l) => l.grantId).filter((id) => id != null))];

  // Ledger_Module_V1_Spec.md 3.2: a line tagged to a grant defaults its restriction class from
  // the grant's own donor_restriction_class when the caller didn't set one explicitly -- still
  // stored per-line (not just derived at read time) so reports can query without a join.
  const linesNeedingDefault = parsedLines.filter((l) => l.grantId != null && l.restrictionClass == null);
  if (linesNeedingDefault.length > 0) {
    const grantR = await pool.query(
      `SELECT id, donor_restriction_class::text AS donor_restriction_class FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`,
      [orgId, grantIds]
    );
    const restrictionByGrantId = new Map(grantR.rows.map((r) => [r.id, r.donor_restriction_class]));
    for (const l of linesNeedingDefault) {
      const grantRestriction = restrictionByGrantId.get(l.grantId);
      if (grantRestriction != null) l.restrictionClass = grantRestriction;
    }
  }

  let fiscalYear;
  try {
    const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
    fiscalYear = fiscalYearForDate(transactionDate, fyEndMonth);
  } catch (e) {
    console.error('postLedgerTransaction (fiscal year resolve):', e.message);
    return { httpStatus: 500, body: { error: 'Could not resolve fiscal year for this transaction date' } };
  }

  let initialStatus = 'posted';
  if (!internalApproval) {
    let requiresApproval = false;
    if (grantIds.length > 0) {
      const fedR = await pool.query(
        `SELECT 1 FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[]) AND is_federal_award = true LIMIT 1`,
        [orgId, grantIds]
      );
      requiresApproval = fedR.rows.length > 0;
    }
    initialStatus = requiresApproval ? 'pending_approval' : 'posted';
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const txnResult = await client.query(
      `INSERT INTO org_ledger_transactions
         (org_id, transaction_date, fiscal_year, memo, payee, reference_number, source, created_by, status, reverses_transaction_id,
          approved_by, approved_at, source_ref_id, source_ref_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        orgId, transactionDate, fiscalYear, memo, payee, referenceNumber, source || 'manual', userId, initialStatus, reversesTransactionId || null,
        internalApproval ? internalApproval.approvedBy : null,
        internalApproval ? (internalApproval.approvedAt || new Date().toISOString()) : null,
        internalApproval ? internalApproval.sourceRefId : null,
        internalApproval ? internalApproval.sourceRefType : null,
      ]
    );
    const transactionId = txnResult.rows[0].id;

    for (const l of parsedLines) {
      await client.query(
        `INSERT INTO org_ledger_lines
           (transaction_id, account_id, program_id, grant_id, donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo)
         VALUES ($1, $2, $3, $4, $5::org_restriction_class, $6, $7, $8, $9)`,
        [transactionId, l.accountId, l.programId, l.grantId, l.restrictionClass, l.boardDesignationId, l.debitCents, l.creditCents, l.lineMemo]
      );
    }

    await client.query('COMMIT');
    // Audit logging on the ledger-writing path itself, not just the routes that call it --
    // the reversal chain was previously this module's entire audit trail (zero logAudit
    // calls anywhere in ledgerPosting.js/bills.js/invoices.js/bankReconciliation.js before
    // this). Fire-and-forget after COMMIT: logAudit never throws (catches its own errors
    // internally), so this can't roll back a transaction that already succeeded.
    logAudit(pool, {
      orgId, userId, action: 'create',
      tableName: 'org_ledger_transactions', recordId: transactionId,
      metadata: { source: source || 'manual', status: initialStatus, line_count: parsedLines.length },
    }).catch(() => {});
    return { httpStatus: 201, body: { id: transactionId, status: initialStatus } };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    const translated = translateLedgerWriteError(e);
    if (translated) return { httpStatus: translated.status, body: translated.body };
    console.error('postLedgerTransaction:', e.message);
    return { httpStatus: 500, body: { error: 'Could not post transaction' } };
  } finally {
    client.release();
  }
}

/**
 * Void, not delete -- extracted from ledger.js's void endpoint (Phase 4) so Bank
 * Reconciliation's unreconcile (Step 6) shares the exact same code path instead of
 * duplicating the existing-row check + UPDATE. The fiscal-year-lock trigger already blocks
 * this on a locked period (trg_fy_lock_ledger_transactions fires on any UPDATE, not just
 * status changes touched by the void endpoint specifically) -- callers that need the
 * locked-period reversing-entry path (spec Section 2.5) should check
 * isTransactionFiscalYearLocked() themselves BEFORE calling this, not rely on catching CA001
 * here, so they can choose the reversal path deliberately rather than reactively.
 *
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, transactionId: number, voidReason: string }} opts
 */
async function voidLedgerTransaction(pool, { orgId, userId, transactionId, voidReason }) {
  if (!voidReason) return { httpStatus: 400, body: { error: 'void_reason is required' } };
  try {
    const existing = await pool.query(
      `SELECT id, status FROM org_ledger_transactions WHERE id = $1 AND org_id = $2`,
      [transactionId, orgId]
    );
    if (existing.rows.length === 0) return { httpStatus: 404, body: { error: 'Transaction not found' } };
    if (existing.rows[0].status === 'voided') {
      return { httpStatus: 409, body: { error: 'Transaction is already voided', code: 'already_voided' } };
    }

    await pool.query(
      `UPDATE org_ledger_transactions
       SET status = 'voided', voided_at = NOW(), voided_by = $1, void_reason = $2
       WHERE id = $3 AND org_id = $4`,
      [userId, voidReason, transactionId, orgId]
    );
    logAudit(pool, {
      orgId, userId, action: 'update',
      tableName: 'org_ledger_transactions', recordId: transactionId,
      fields: [{ fieldName: 'status', oldValue: existing.rows[0].status, newValue: 'voided' }],
      metadata: { void_reason: voidReason },
    }).catch(() => {});
    return { httpStatus: 200, body: { id: transactionId, status: 'voided' } };
  } catch (e) {
    const translated = translateLedgerWriteError(e);
    if (translated) return { httpStatus: translated.status, body: translated.body };
    console.error('voidLedgerTransaction:', e.message);
    return { httpStatus: 500, body: { error: 'Could not void transaction' } };
  }
}

/**
 * True if the given fiscal year is currently locked for this org. Used by Bank
 * Reconciliation's unreconcile (Step 6) to choose between the void path (unlocked) and the
 * reversing-entry path (locked) BEFORE attempting a write, per the spec's explicit two-path
 * design -- not inferred after the fact from a caught CA001.
 */
async function isFiscalYearLocked(pool, orgId, fiscalYear) {
  const r = await pool.query(
    `SELECT locked_at FROM org_fiscal_year_locks WHERE org_id = $1 AND fiscal_year = $2`,
    [orgId, fiscalYear]
  );
  return !!(r.rows[0] && r.rows[0].locked_at);
}

/**
 * Mirrors every line of an existing transaction with debit/credit swapped -- same account,
 * program, grant, and restriction on each line, so the reversal cancels the original's effect
 * exactly, including on any grant/program-level balances the original touched. Does not read
 * or modify the original transaction/lines; the caller already has them.
 */
function buildReversingLines(originalLines) {
  return originalLines.map((l) => ({
    account_id: l.account_id,
    program_id: l.program_id,
    grant_id: l.grant_id,
    donor_restriction_class: l.donor_restriction_class,
    board_designation_id: l.board_designation_id,
    debit_cents: l.credit_cents,
    credit_cents: l.debit_cents,
    line_memo: l.line_memo,
  }));
}

module.exports = {
  RESTRICTION_CLASSES, DATE_RE, translateLedgerWriteError, parseLedgerLines,
  postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, buildReversingLines,
};
