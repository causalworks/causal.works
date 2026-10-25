'use strict';

// Tools that post or unpost a sponsored-project disbursement and record money received against a pledge installment.

const { defineTool } = require('./registry');
const { postDisbursement, unpostDisbursement } = require('../lib/disbursementPosting');
const { recordPledgeInstallmentReceipt } = require('../lib/pledgeReceipt');
const { acquireDocumentLock } = require('../lib/documentLock');

const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n >= 1 ? n : null; };
const optInt = (v) => (v != null && v !== '' ? Number(v) : undefined);

async function locked(ctx, key, fn) {
  const lock = await acquireDocumentLock(ctx.pool, key);
  try { return await fn(); } finally { await lock.release(); }
}

defineTool({
  name: 'disbursement.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    if (!id) return { error: 'invalid disbursement id' };
    return { value: { id, postingDate: input.posting_date != null ? String(input.posting_date) : null,
      expenseAccountId: optInt(input.expense_account_id), bankAccountId: optInt(input.bank_account_id), programId: optInt(input.program_id) } };
  },
  run: (ctx, v) => locked(ctx, 'disbursement:' + v.id, () => postDisbursement(ctx.pool, {
    orgId: ctx.orgId, userId: ctx.userId, disbursementId: v.id, postingDate: v.postingDate,
    expenseAccountId: v.expenseAccountId, bankAccountId: v.bankAccountId, programId: v.programId,
  })),
});

defineTool({
  name: 'disbursement.unpost',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    if (!id) return { error: 'invalid disbursement id' };
    return { value: { id, reason: String(input.reason || '').trim() } };
  },
  run: (ctx, v) => locked(ctx, 'disbursement:' + v.id, () => unpostDisbursement(ctx.pool, {
    orgId: ctx.orgId, userId: ctx.userId, disbursementId: v.id, reason: v.reason,
  })),
});

defineTool({
  name: 'pledge_installment.receive',
  capability: 'post',
  nonHuman: 'propose',
  validate: (input) => {
    const id = posInt(input.id);
    const bankAccountId = posInt(input.bank_account_id);
    const amountCents = Number.parseInt(String(input.amount_cents), 10);
    if (!id) return { error: 'invalid installment id' };
    if (!bankAccountId) return { error: 'bank_account_id is required' };
    if (!input.date || !/^\d{4}-\d{2}-\d{2}/.test(String(input.date))) return { error: 'date is required and must be YYYY-MM-DD' };
    if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: 'amount_cents must be a positive integer' };
    return { value: { id, bankAccountId, date: String(input.date).slice(0, 10), amountCents, reference: input.reference || null } };
  },
  run: (ctx, v) => locked(ctx, 'pledge_installment:' + v.id, () => recordPledgeInstallmentReceipt(ctx.pool, {
    orgId: ctx.orgId, userId: ctx.userId, installmentId: v.id, bankAccountId: v.bankAccountId,
    date: v.date, amountCents: v.amountCents, reference: v.reference,
  })),
});
