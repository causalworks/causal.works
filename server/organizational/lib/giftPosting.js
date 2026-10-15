'use strict';

const { postLedgerTransaction, buildReversingLines } = require('./ledgerPosting');
const { logAudit } = require('./auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

  const sysR = await pool.query(
    `SELECT is_system_contribution_revenue_account FROM org_accounts WHERE id = $1 AND org_id = $2 LIMIT 1`,
    [revenueAccountId, orgId]
  );
  if (!sysR.rows.length) return { httpStatus: 400, body: { error: 'revenue_account_id not found for this organization' } };
  if (sysR.rows[0].is_system_contribution_revenue_account) {
    return { httpStatus: 400, body: { error: 'In-kind gifts must post to a distinct Gifts-in-Kind revenue account, not the org\'s ordinary cash contribution-revenue account (ASU 2020-07 requires separate presentation).' } };
  }

  const expR = await pool.query(
    `SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2 AND type IN ('expense', 'asset') AND is_posting = true AND is_cash_account = false LIMIT 1`,
    [expenseAccountId, orgId]
  );
  if (!expR.rows.length) {
    return { httpStatus: 400, body: { error: 'Choose an expense account for what was donated (or an asset account for goods you will keep and depreciate). Bank accounts cannot be used.' } };
  }

  const amountCents = Number(gift.amount_cents);
  const restrictionClass = opts.donorRestrictionClass !== undefined ? opts.donorRestrictionClass : null;

  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: postingDate,
    memo: 'In-kind gift: ' + (gift.in_kind_description || ('gift #' + gift.id)),
    payee: null, referenceNumber: null,
    lines: [
      { account_id: expenseAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: amountCents, credit_cents: 0, source_line_type: 'org_gifts', source_line_id: gift.id },
      { account_id: revenueAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: 0, credit_cents: amountCents, source_line_type: 'org_gifts', source_line_id: gift.id },
    ],
    source: 'gift_in_kind',
    constituentId: gift.constituent_id,
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

async function postPledgeCommitment(pool, opts) {
  const { orgId, userId, giftId, postingDate } = opts;
  if (!postingDate || !DATE_RE.test(postingDate)) {
    return { httpStatus: 400, body: { error: 'posting_date is required and must be YYYY-MM-DD' } };
  }
  const giftR = await pool.query('SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
  if (!giftR.rows.length) return { httpStatus: 404, body: { error: 'Gift not found' } };
  const gift = giftR.rows[0];
  if (gift.gift_type !== 'pledge') return { httpStatus: 400, body: { error: 'This gift is not a pledge' } };
  if (gift.pledge_status && gift.pledge_status !== 'unconditional') {
    return { httpStatus: 409, body: { error: 'This pledge is held in Funding (' + gift.pledge_status + '). It can be posted once Funding marks it unconditional.', code: 'pledge_not_unconditional' } };
  }
  if (gift.posting_status !== 'unposted') {
    return { httpStatus: 409, body: { error: `Gift posting_status is ${gift.posting_status}, expected unposted`, code: 'invalid_posting_status' } };
  }

  const revenueAccountId = opts.revenueAccountId;
  const receivableAccountId = opts.receivableAccountId || gift.receivable_account_id;
  const programId = opts.programId || gift.program_id;
  if (!revenueAccountId || !receivableAccountId || !programId) {
    return { httpStatus: 400, body: { error: 'revenue_account_id, receivable_account_id, and program_id are all required to post a pledge commitment' } };
  }

  let acceptedRateBps = null, acceptedYears = null, presentValueCents = null;
  if (gift.is_multi_year_pledge) {
    acceptedRateBps = opts.discountRateBps != null ? Number(opts.discountRateBps) : (gift.discount_rate_bps != null ? Number(gift.discount_rate_bps) : null);
    acceptedYears = opts.pledgeYears != null ? Number(opts.pledgeYears) : (gift.pledge_years != null ? Number(gift.pledge_years) : null);
    if (!Number.isInteger(acceptedRateBps) || acceptedRateBps < 0 || acceptedRateBps > 5000) {
      return { httpStatus: 400, body: { error: 'This is a multi-year pledge: set the discount rate (0 to 50 percent) before posting.', code: 'needs_discount_rate' } };
    }
    if (!Number.isFinite(acceptedYears) || acceptedYears <= 0) {
      return { httpStatus: 400, body: { error: 'This is a multi-year pledge: set the pledge term in years before posting.', code: 'needs_pledge_years' } };
    }
    const face = Number(gift.total_pledged_cents);
    presentValueCents = Math.round(face / Math.pow(1 + acceptedRateBps / 10000, acceptedYears));
  }
  const amountCents = gift.is_multi_year_pledge
    ? presentValueCents
    : Number(gift.total_pledged_cents != null ? gift.total_pledged_cents : gift.amount_cents);
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return { httpStatus: 400, body: { error: 'Could not resolve a positive commitment amount for this pledge (check total_pledged_cents / discounted_present_value_cents)' } };
  }

  const restrictionClass = opts.donorRestrictionClass !== undefined
    ? opts.donorRestrictionClass
    : (gift.is_multi_year_pledge ? 'temporarily_restricted' : null);

  const result = await postLedgerTransaction(pool, {
    orgId, userId, transactionDate: postingDate,
    memo: 'Pledge commitment: gift #' + gift.id,
    payee: null, referenceNumber: null,
    lines: [
      { account_id: receivableAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: amountCents, credit_cents: 0, source_line_type: 'org_gifts', source_line_id: gift.id },
      { account_id: revenueAccountId, program_id: programId, grant_id: gift.grant_id, donor_restriction_class: restrictionClass, debit_cents: 0, credit_cents: amountCents, source_line_type: 'org_gifts', source_line_id: gift.id },
    ],
    source: 'pledge_commitment',
    constituentId: gift.constituent_id,
    internalApproval: { approvedBy: userId, sourceRefId: gift.id, sourceRefType: 'org_gifts' },
  });
  if (result.httpStatus >= 400) return result;

  await pool.query(
    `UPDATE org_gifts SET posting_status = 'posted', ledger_transaction_id = $1,
       receivable_account_id = $2, program_id = $3, amount_cents = $4,
       discount_rate_bps = COALESCE($7, discount_rate_bps), pledge_years = COALESCE($8, pledge_years),
       discounted_present_value_cents = COALESCE($9, discounted_present_value_cents),
       discounting_accepted_at = CASE WHEN $7 IS NOT NULL THEN NOW() ELSE discounting_accepted_at END,
       discounting_accepted_by_user_id = CASE WHEN $7 IS NOT NULL THEN $10 ELSE discounting_accepted_by_user_id END
     WHERE id = $5 AND org_id = $6`,
    [result.body.id, receivableAccountId, programId, amountCents, giftId, orgId, acceptedRateBps, acceptedYears, presentValueCents, userId]
  );
  logAudit(pool, {
    orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
    metadata: { operation: 'post_pledge_commitment', ledger_transaction_id: result.body.id },
  }).catch(() => {});

  return { httpStatus: 200, body: { id: giftId, posting_status: 'posted', ledger_transaction_id: result.body.id } };
}

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
