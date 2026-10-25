'use strict';

// Tools that submit, approve, pay and void an expense claim.

const { defineTool, scopeAllows } = require('./registry');
const { postLedgerTransaction, voidLedgerTransaction, isFiscalYearLocked, buildReversingLines } = require('../lib/ledgerPosting');
const { acquireDocumentLock } = require('../lib/documentLock');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };
const NOT_FOUND = { httpStatus: 404, body: { error: 'Expense claim not found' } };

async function loadClaim(ctx, claimId) {
  const r = await ctx.pool.query('SELECT * FROM org_expense_claims WHERE id = $1 AND org_id = $2', [claimId, ctx.orgId]);
  return r.rows[0] || null;
}
async function loadLines(ctx, claimId) {
  return (await ctx.pool.query('SELECT * FROM org_expense_claim_lines WHERE claim_id = $1', [claimId])).rows;
}
async function submitterName(ctx, claim) {
  const r = await ctx.pool.query('SELECT email FROM users WHERE id = $1', [claim.submitted_by]);
  return r.rows[0] ? r.rows[0].email : null;
}
function claimLedgerLines(lines, creditAccountId, creditMemo) {
  const out = lines.map((l) => ({
    account_id: l.account_id, program_id: l.program_id, grant_id: l.grant_id,
    debit_cents: Number(l.amount_cents), credit_cents: 0, line_memo: l.line_memo,
    source_line_type: 'org_expense_claim_lines', source_line_id: l.id,
  }));
  out.push({ account_id: creditAccountId, program_id: lines[0].program_id, grant_id: null, debit_cents: 0, credit_cents: lines.reduce((s, l) => s + Number(l.amount_cents), 0), line_memo: creditMemo });
  return out;
}
function claimAudit(ctx, claimId, from, to, extra) {
  logAudit(ctx.pool, {
    orgId: ctx.orgId, userId: ctx.userId, action: 'update', tableName: 'org_expense_claims', recordId: claimId,
    fields: [{ fieldName: 'status', oldValue: from, newValue: to }], metadata: { ...ctx.meta, ...extra },
  }).catch(() => {});
}
async function withClaimLock(ctx, claimId, fn) {
  const lock = await acquireDocumentLock(ctx.pool, 'claim:' + claimId);
  try { return await fn(); } finally { await lock.release(); }
}
const idOnly = (input) => (posInt(input.id) ? { value: { id: posInt(input.id) } } : { error: 'invalid claim id' });

defineTool({
  name: 'expense_claim.submit',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    if (!id) return { error: 'invalid claim id' };
    return { value: { id, bankAccountId: input.bank_account_id } };
  },
  run: (ctx, v) => withClaimLock(ctx, v.id, async () => {
    const { pool, orgId, userId } = ctx;
    const claim = await loadClaim(ctx, v.id);
    if (!claim) return NOT_FOUND;
    const lines = await loadLines(ctx, v.id);
    if (!scopeAllows(ctx, lines.map((l) => l.program_id))) return NOT_FOUND;
    if (claim.status !== 'draft') return { httpStatus: 409, body: { error: `Claim is not a draft (status: ${claim.status})`, code: 'not_draft' } };
    if (!lines.length) return { httpStatus: 422, body: { error: 'Claim has no line items' } };
    const claimTotalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);

    const hasReceipt = (await pool.query(
      `SELECT 1 FROM org_documents WHERE org_id = $1 AND source_ref_type = 'expense_claim' AND source_ref_id = $2 AND archived_at IS NULL LIMIT 1`,
      [orgId, v.id])).rows.length > 0;
    if (!hasReceipt) {
      const s = await pool.query('SELECT expense_claim_receipt_required_threshold_cents FROM org_settings WHERE org_id = $1', [orgId]);
      const thresholdCents = (s.rows[0] && s.rows[0].expense_claim_receipt_required_threshold_cents) || 0;
      if (!(claimTotalCents < thresholdCents) && claim.receipt_affidavit_at == null) {
        return { httpStatus: 422, body: {
          error: 'A receipt is required before submitting, or file a missing-receipt affidavit',
          code: 'receipt_or_affidavit_required', threshold_cents: String(thresholdCents), claim_total_cents: String(claimTotalCents),
        } };
      }
    }

    const modeR = await pool.query('SELECT expense_claim_approval_mode FROM org_settings WHERE org_id = $1', [orgId]);
    const mode = (modeR.rows[0] && modeR.rows[0].expense_claim_approval_mode) || 'pre_approval';
    const name = await submitterName(ctx, claim);

    if (mode === 'pre_approval') {
      await pool.query(`UPDATE org_expense_claims SET status = 'pending_approval', updated_at = NOW() WHERE id = $1 AND org_id = $2`, [v.id, orgId]);
      return { httpStatus: 200, body: { id: v.id, status: 'pending_approval' } };
    }

    const bankAccountId = posInt(v.bankAccountId);
    if (!bankAccountId) return { httpStatus: 400, body: { error: 'bank_account_id is required to pay this claim now (post-payout approval mode)' } };
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: claim.claim_date,
      memo: `Expense claim #${v.id} (${name || 'claimant'}) -- paid, confirmation pending`,
      payee: name, referenceNumber: null,
      lines: claimLedgerLines(lines, bankAccountId, `Reimbursement paid to ${name || 'claimant'} for expense claim #${v.id}`),
      source: 'expense_claim_approval',
    });
    if (postResult.httpStatus >= 400) return postResult;
    await pool.query(
      `UPDATE org_expense_claims
       SET status = 'paid_pending_confirmation', ledger_transaction_id = $1, payment_ledger_transaction_id = $1, bank_account_id = $2, updated_at = NOW()
       WHERE id = $3 AND org_id = $4`,
      [postResult.body.id, bankAccountId, v.id, orgId]);
    claimAudit(ctx, v.id, 'draft', 'paid_pending_confirmation', { ledger_transaction_id: postResult.body.id, approval_mode: 'post_payout' });
    return { httpStatus: 200, body: { id: v.id, status: 'paid_pending_confirmation', ledger_transaction_id: postResult.body.id } };
  }),
});

defineTool({
  name: 'expense_claim.approve',
  capability: 'approve',
  nonHuman: 'propose',
  validate: idOnly,
  run: (ctx, v) => withClaimLock(ctx, v.id, async () => {
    const { pool, orgId, userId } = ctx;
    const claim = await loadClaim(ctx, v.id);
    if (!claim) return NOT_FOUND;
    const lines = await loadLines(ctx, v.id);
    if (!scopeAllows(ctx, lines.map((l) => l.program_id))) return NOT_FOUND;
    if (claim.status !== 'pending_approval') return { httpStatus: 409, body: { error: `Claim is not awaiting approval (status: ${claim.status})`, code: 'not_pending_approval' } };
    if (claim.submitted_by === userId) return { httpStatus: 403, body: { error: 'You cannot approve your own expense claim', code: 'self_approval_blocked' } };
    if (!['admin', 'board'].includes(String(ctx.orgRole))) return { httpStatus: 403, body: { error: 'Only an admin or board member can approve an expense claim', code: 'role_not_permitted' } };

    const name = await submitterName(ctx, claim);
    const payableId = (await pool.query('SELECT org_get_or_create_expense_claims_payable_account($1) AS id', [orgId])).rows[0].id;
    await pool.query('UPDATE org_expense_claims SET approved_by = $1, approved_at = NOW() WHERE id = $2 AND org_id = $3', [userId, v.id, orgId]);
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: claim.claim_date,
      memo: `Expense claim #${v.id} (${name || 'claimant'}) -- approved`,
      payee: name, referenceNumber: null,
      lines: claimLedgerLines(lines, payableId, `Expense Claims Payable for claim #${v.id}`),
      source: 'expense_claim_approval',
      internalApproval: { approvedBy: userId, sourceRefId: v.id, sourceRefType: 'expense_claim' },
    });
    if (postResult.httpStatus >= 400) {
      await pool.query('UPDATE org_expense_claims SET approved_by = NULL, approved_at = NULL WHERE id = $1 AND org_id = $2', [v.id, orgId]);
      return postResult;
    }
    await pool.query(`UPDATE org_expense_claims SET status = 'approved', ledger_transaction_id = $1, updated_at = NOW() WHERE id = $2 AND org_id = $3`, [postResult.body.id, v.id, orgId]);
    claimAudit(ctx, v.id, 'pending_approval', 'approved', { ledger_transaction_id: postResult.body.id });
    return { httpStatus: 200, body: { id: v.id, status: 'approved', ledger_transaction_id: postResult.body.id } };
  }),
});

defineTool({
  name: 'expense_claim.pay',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    if (!id) return { error: 'invalid claim id' };
    const bankAccountId = posInt(input.bank_account_id);
    if (!bankAccountId) return { error: 'bank_account_id is required' };
    const paymentDate = input.payment_date != null ? String(input.payment_date) : null;
    if (!paymentDate || !DATE_RE.test(paymentDate)) return { error: 'payment_date is required and must be YYYY-MM-DD' };
    return { value: { id, bankAccountId, paymentDate } };
  },
  run: (ctx, v) => withClaimLock(ctx, v.id, async () => {
    const { pool, orgId, userId } = ctx;
    const claim = await loadClaim(ctx, v.id);
    if (!claim) return NOT_FOUND;
    const lines = await loadLines(ctx, v.id);
    if (!scopeAllows(ctx, lines.map((l) => l.program_id))) return NOT_FOUND;
    if (claim.status !== 'approved') return { httpStatus: 409, body: { error: `Claim is not approved (status: ${claim.status})`, code: 'not_approved' } };

    const totalCents = lines.reduce((s, l) => s + Number(l.amount_cents), 0);
    const payableId = (await pool.query('SELECT org_get_or_create_expense_claims_payable_account($1) AS id', [orgId])).rows[0].id;
    const name = await submitterName(ctx, claim);
    const postResult = await postLedgerTransaction(pool, {
      orgId, userId, transactionDate: v.paymentDate,
      memo: `Reimbursement paid: expense claim #${v.id} (${name || 'claimant'})`,
      payee: name, referenceNumber: null,
      lines: [
        { account_id: payableId, program_id: lines[0].program_id, grant_id: null, debit_cents: totalCents, credit_cents: 0 },
        { account_id: v.bankAccountId, program_id: lines[0].program_id, grant_id: null, debit_cents: 0, credit_cents: totalCents },
      ],
      source: 'expense_claim_payment',
    });
    if (postResult.httpStatus >= 400) return postResult;
    await pool.query(
      `INSERT INTO org_expense_claim_payments (org_id, claim_id, payment_date, amount_cents, bank_account_id, ledger_transaction_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [orgId, v.id, v.paymentDate, totalCents, v.bankAccountId, postResult.body.id, userId]);
    await pool.query(
      `UPDATE org_expense_claims SET status = 'paid', payment_ledger_transaction_id = $1, bank_account_id = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4`,
      [postResult.body.id, v.bankAccountId, v.id, orgId]);
    return { httpStatus: 200, body: { id: v.id, status: 'paid', ledger_transaction_id: postResult.body.id } };
  }),
});

defineTool({
  name: 'expense_claim.void',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    if (!id) return { error: 'invalid claim id' };
    const reason = input.reason != null ? String(input.reason).trim() : '';
    if (!reason) return { error: 'reason is required' };
    return { value: { id, reason } };
  },
  // ctx.accountingWriter: async () => null when allowed, else a { httpStatus, body } refusal; asked only when the claim is not the caller's own unposted claim.
  run: (ctx, v) => withClaimLock(ctx, v.id, async () => {
    const { pool, orgId, userId } = ctx;
    const claim = await loadClaim(ctx, v.id);
    if (!claim) return NOT_FOUND;
    if (!scopeAllows(ctx, (await loadLines(ctx, v.id)).map((l) => l.program_id))) return NOT_FOUND;
    if (['void', 'disputed'].includes(claim.status)) return { httpStatus: 409, body: { error: `Claim is already ${claim.status}`, code: 'already_terminal' } };
    const ownUnposted = claim.submitted_by === userId && !claim.ledger_transaction_id && !claim.payment_ledger_transaction_id;
    if (!ownUnposted) {
      const denial = ctx.accountingWriter ? await ctx.accountingWriter() : { httpStatus: 403, body: { error: 'Accounting write access is required', code: 'accounting_write_required' } };
      if (denial) return denial;
    }

    const wasPaidOut = ['paid', 'paid_pending_confirmation', 'confirmed'].includes(claim.status);
    const newStatus = ['paid_pending_confirmation', 'confirmed'].includes(claim.status) ? 'disputed' : 'void';

    async function voidOrReverse(transactionId) {
      const txn = (await pool.query('SELECT * FROM org_ledger_transactions WHERE id = $1 AND org_id = $2', [transactionId, orgId])).rows[0];
      if (!txn || txn.status === 'voided') return;
      if (!(await isFiscalYearLocked(pool, orgId, txn.fiscal_year))) {
        await voidLedgerTransaction(pool, { orgId, userId, transactionId, voidReason: v.reason });
        return;
      }
      const original = await pool.query(
        `SELECT account_id, program_id, grant_id, donor_restriction_class::text AS donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
         FROM org_ledger_lines WHERE transaction_id = $1`, [transactionId]);
      await postLedgerTransaction(pool, {
        orgId, userId, transactionDate: new Date().toISOString().slice(0, 10),
        memo: `Reversal of expense claim #${v.id} transaction ${transactionId} (locked FY${txn.fiscal_year}): ${v.reason}`,
        payee: null, referenceNumber: null, lines: buildReversingLines(original.rows),
        source: txn.source, reversesTransactionId: transactionId,
      });
    }

    if (claim.ledger_transaction_id) await voidOrReverse(claim.ledger_transaction_id);
    if (claim.payment_ledger_transaction_id && claim.payment_ledger_transaction_id !== claim.ledger_transaction_id) {
      await voidOrReverse(claim.payment_ledger_transaction_id);
    }
    await pool.query(
      'UPDATE org_expense_claims SET status = $1, disputed_reason = $2, updated_at = NOW() WHERE id = $3 AND org_id = $4',
      [newStatus, newStatus === 'disputed' ? v.reason : null, v.id, orgId]);
    claimAudit(ctx, v.id, claim.status, newStatus, { reason: v.reason, was_paid_out: wasPaidOut });
    return { httpStatus: 200, body: { id: v.id, status: newStatus } };
  }),
});
