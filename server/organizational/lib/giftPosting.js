'use strict';

/**
 * Posts in-kind gifts and pledge commitments from Donor CRM (org_gifts) to the ledger.
 * Two gift sub-types with no other path to the books -- cash donation/grant/dues gifts stay
 * out of scope here, they already reach the ledger via ordinary bank-deposit coding in Cash
 * Coding/Reconcile. Both functions require an explicit account review at the call site
 * (server/organizational/routes/giftPostings.js) -- they never run from donors.js itself, per
 * the "Accounting posts within the module" directive that also shaped org_bank_statement_lines'
 * unconfirmed/confirmed flow. Mirrors fixedAssets.js's dispose()/run-depreciation call shape:
 * load the pending row, build two balanced lines, call postLedgerTransaction, record the
 * result back onto the source row.
 */

const { postLedgerTransaction, buildReversingLines } = require('./ledgerPosting');
const { logAudit } = require('./auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {import('pg').Pool} pool
 * @param {{ orgId: number, userId: number, giftId: number, postingDate: string,
 *   revenueAccountId?: number, expenseAccountId?: number, programId?: number,
 *   donorRestrictionClass?: string|null }} opts
 */
async function postInKindGift(pool, opts) {
  const { orgId, userId, giftId, postingDate } = opts;
  if (!postingDate || !DATE_RE.test(postingDate)) {
    return { httpStatus: 400, body: { error: 'posting_date is required and must be YYYY-MM-DD' } };
  }
  const giftR = await pool.query('SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
  if (!giftR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
  const gift = giftR.rows[0];
  if (gift.payment_method !== 'in_kind') return { httpStatus: 400, body: { error: 'This gift is not in-kind' } };
  if (gift.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Gift posting_status is ${gift.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }

  const revenueAccountId = opts.revenueAccountId || gift.in_kind_revenue_account_id;
  const expenseAccountId = opts.expenseAccountId || gift.in_kind_expense_account_id;
  const programId = opts.programId || gift.program_id;
  if (!revenueAccountId || !expenseAccountId || !programId) {
    return { httpStatus: 400, body: { error: 'revenue_account_id, expense_account_id, and program_id are all required to post an in-kind gift' } };
  }

  // ASU 2020-07: gifts-in-kind must show as a separate line from cash/financial-asset
  // contributions -- so the revenue account here cannot be the org's ordinary cash
  // contribution-revenue account. Mirrors Find & Recode's system-account guard shape.
  const sysR = await pool.query(
    `SELECT is_system_contribution_revenue_account FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [revenueAccountId, orgId]
  );
  if (!sysR.rows.length) return { httpStatus: 400, body: { error: 'revenue_account_id not found for this organization' } };
  if (sysR.rows[0].is_system_contribution_revenue_account) {
    return { httpStatus: 400, body: { error: 'In-kind gifts must post to a distinct Gifts-in-Kind revenue account, not the org\'s ordinary cash contribution-revenue account (ASU 2020-07 requires separate presentation).' } };
  }

  // is_non_cash (migration 233) was written with exactly this case in its column comment --
  // the Statement of Cash Flows only adds an in-kind expense back to operating cash flow if
  // this is set, so an in-kind posting to an account missing the flag would silently
  // understate operating cash flow rather than erroring loudly. Required, not auto-set: the
  // org still makes the explicit account-design choice, same discipline as is_non_cash itself.
  const expR = await pool.query(
    `SELECT is_non_cash FROM org_accounts WHERE id = $1 AND org_id = $2 AND type = 'expense' LIMIT 1`,
    [expenseAccountId, orgId]
  );
  if (!expR.rows.length) return { httpStatus: 400, body: { error: 'expense_account_id not found for this organization, or is not an expense account' } };
  if (!expR.rows[0].is_non_cash) {
    return { httpStatus: 400, body: { error: 'The in-kind expense account must have is_non_cash = true (Accounts settings) so the Statement of Cash Flows adds it back correctly.' } };
  }

  const amountCents = Number(gift.amount_cents);
  const restrictionClass = opts.donorRestrictionClass !== undefined ? opts.donorRestrictionClass : null;

  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: postingDate,
    memo: 'In-kind gift: ' + (gift.in_kind_description || ('gift #' + gift.id)),
    payee: null, referenceNumber: null,
    lines: [
      { account_id: expenseAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: amountCents, credit_cents: 0 },
      { account_id: revenueAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: 0, credit_cents: amountCents },
    ],
    source: 'gift_in_kind',
    internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
  });
  if (result.httpStatus >= 400) return result;

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1,
       in_kind_revenue_account_id = $2, in_kind_expense_account_id = $3, program_id = $4
     WHERE id = $5 AND org_id = $6`,
    [result.body.id, revenueAccountId, expenseAccountId, programId, giftId, orgId]
  );
  logAudit(pool, {
    orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
    metadata: { operation: 'post_in_kind_gift', ledger_transaction_id: result.body.id },
  }).catch(() => {});

  return { httpStatus: 200, body: { id: giftId, posting_status: 'posted', ledger_transaction_id: result.body.id } };
}

/**
 * Pledge commitment posting: debit the receivable / credit contribution revenue, at
 * discounted_present_value_cents if multi-year else total_pledged_cents. Collections aren't
 * handled here -- they're ordinary bank deposits coded against receivable_account_id in Cash
 * Coding/Reconcile, see the spec doc for why that's deliberate, not a gap.
 */
async function postPledgeCommitment(pool, opts) {
  const { orgId, userId, giftId, postingDate } = opts;
  if (!postingDate || !DATE_RE.test(postingDate)) {
    return { httpStatus: 400, body: { error: 'posting_date is required and must be YYYY-MM-DD' } };
  }
  const giftR = await pool.query('SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
  if (!giftR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
  const gift = giftR.rows[0];
  if (gift.gift_type !== 'pledge') return { httpStatus: 400, body: { error: 'This gift is not a pledge' } };
  if (gift.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Gift posting_status is ${gift.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }

  const revenueAccountId = opts.revenueAccountId;
  const receivableAccountId = opts.receivableAccountId || gift.receivable_account_id;
  const programId = opts.programId || gift.program_id;
  if (!revenueAccountId || !receivableAccountId || !programId) {
    return { httpStatus: 400, body: { error: 'revenue_account_id, receivable_account_id, and program_id are all required to post a pledge commitment' } };
  }

  const amountCents = gift.is_multi_year_pledge
    ? Number(gift.discounted_present_value_cents)
    : Number(gift.total_pledged_cents != null ? gift.total_pledged_cents : gift.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { httpStatus: 400, body: { error: 'Could not resolve a positive commitment amount for this pledge (check total_pledged_cents / discounted_present_value_cents)' } };
  }

  // Time-restricted by default for a multi-year promise unless the caller says otherwise --
  // a grant-linked restriction still takes precedence via postLedgerTransaction's own
  // grant-inherit logic when donorRestrictionClass is left unset here.
  const restrictionClass = opts.donorRestrictionClass !== undefined
    ? opts.donorRestrictionClass
    : (gift.is_multi_year_pledge ? 'temporarily_restricted' : null);

  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: postingDate,
    memo: 'Pledge commitment: gift #' + gift.id,
    payee: null, referenceNumber: null,
    lines: [
      { account_id: receivableAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: amountCents, credit_cents: 0 },
      { account_id: revenueAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: 0, credit_cents: amountCents },
    ],
    source: 'pledge_commitment',
    internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
  });
  if (result.httpStatus >= 400) return result;

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1,
       receivable_account_id = $2, program_id = $3, amount_cents = $4
     WHERE id = $5 AND org_id = $6`,
    [result.body.id, receivableAccountId, programId, amountCents, giftId, orgId]
  );
  logAudit(pool, {
    orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
    metadata: { operation: 'post_pledge_commitment', ledger_transaction_id: result.body.id },
  }).catch(() => {});

  return { httpStatus: 200, body: { id: giftId, posting_status: 'posted', ledger_transaction_id: result.body.id } };
}

/** Void an already-posted gift (in-kind or pledge commitment) -- reverses the ledger
 * transaction via buildReversingLines, same pattern as Find & Recode's void path, and resets
 * the gift row so it can be corrected and re-posted. */
async function voidGiftPosting(pool, { orgId, userId, giftId, voidReason }) {
  if (!voidReason) return { httpStatus: 400, body: { error: 'void_reason is required' } };
  const giftR = await pool.query('SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
  if (!giftR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
  const gift = giftR.rows[0];
  if (gift.posting_status !== 'posted' || !gift.ledger_transaction_id) {
    return { httpStatus: 409, body: { error: 'Gift is not currently posted', code: 'not_posted' } };
  }

  const linesR = await pool.query(
    `SELECT account_id, program_id, grant_id, donor_restriction_class, board_designation_id, debit_cents, credit_cents, line_memo
     FROM org_ledger_lines WHERE transaction_id = $1`,
    [gift.ledger_transaction_id]
  );
  const reversingLines = buildReversingLines(linesR.rows);
  const txnR = await pool.query(`SELECT transaction_date::text AS transaction_date, source FROM org_ledger_transactions WHERE id = $1`, [gift.ledger_transaction_id]);
  const originalDate = txnR.rows[0] ? txnR.rows[0].transaction_date : new Date().toISOString().slice(0, 10);

  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: originalDate,
    memo: 'Reversal (' + voidReason + '): gift #' + gift.id,
    payee: null, referenceNumber: null,
    lines: reversingLines,
    source: txnR.rows[0] ? txnR.rows[0].source : 'gift_in_kind',
    reversesTransactionId: gift.ledger_transaction_id,
    internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
  });
  if (result.httpStatus >= 400) return result;

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'void' WHERE id = $1 AND org_id = $2`,
    [giftId, orgId]
  );
  logAudit(pool, {
    orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
    metadata: { operation: 'void_gift_posting', void_reason: voidReason, reversal_transaction_id: result.body.id },
  }).catch(() => {});

  return { httpStatus: 200, body: { id: giftId, posting_status: 'void', reversal_transaction_id: result.body.id } };
}

module.exports = { postInKindGift, postPledgeCommitment, voidGiftPosting };
