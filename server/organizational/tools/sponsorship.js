'use strict';

// Tools that post and void sponsorship recalls, project closing transfers and fee entries. The sponsorship libraries hold their own locks.

const { defineTool } = require('./registry');
const { postRecall, voidRecall } = require('../lib/sponsorMoneyOut');
const { postClosing, voidClosing } = require('../lib/sponsorGrants');
const { runFees, voidFeePosting } = require('../lib/sponsorFeePosting');

const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n > 0 ? n : null; };
const str = (v) => (v ? String(v) : null);

defineTool({
  name: 'sponsor_recall.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, postingDate: str(b.posting_date) } } : { error: 'Invalid recall ID' }; },
  run: (ctx, v) => postRecall(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, recallId: v.id, postingDate: v.postingDate }),
});

defineTool({
  name: 'sponsor_recall.void',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, reason: b.reason } } : { error: 'Invalid recall ID' }; },
  run: (ctx, v) => voidRecall(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, recallId: v.id, reason: v.reason }),
});

defineTool({
  name: 'sponsor_closing.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const id = posInt(b.id);
    return id ? { value: { id, postingDate: str(b.posting_date), bankAccountId: posInt(b.bank_account_id), expenseAccountId: posInt(b.expense_account_id) } } : { error: 'Invalid closing ID' };
  },
  run: (ctx, v) => postClosing(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, closingId: v.id, postingDate: v.postingDate, bankAccountId: v.bankAccountId, expenseAccountId: v.expenseAccountId }),
});

defineTool({
  name: 'sponsor_closing.void',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, reason: b.reason } } : { error: 'Invalid closing ID' }; },
  run: (ctx, v) => voidClosing(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, closingId: v.id, reason: v.reason }),
});

defineTool({
  name: 'sponsor_fees.run',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => ({ value: { throughDate: b.through_date != null ? String(b.through_date) : null } }),
  run: (ctx, v) => runFees(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, throughDate: v.throughDate }),
});

defineTool({
  name: 'sponsor_fee_posting.void',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, reason: b.reason } } : { error: 'Invalid fee entry ID' }; },
  run: (ctx, v) => voidFeePosting(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, postingId: v.id, reason: v.reason }),
});
