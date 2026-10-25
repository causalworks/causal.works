'use strict';

// Tools that post and reverse dues payments and the monthly dues recognition run. The membership accounting library holds its own locks.

const { defineTool } = require('./registry');
const A = require('../lib/membershipAccounting');

const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n > 0 ? n : null; };

defineTool({
  name: 'dues_payment.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, postingDate: b.posting_date, depositAccountId: posInt(b.deposit_account_id) } } : { error: 'Invalid id' }; },
  run: (ctx, v) => A.postDuesPayment(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, paymentId: v.id, postingDate: v.postingDate, depositAccountId: v.depositAccountId }),
});

defineTool({
  name: 'dues_payment.reverse',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => { const id = posInt(b.id); return id ? { value: { id, reason: b.reason } } : { error: 'Invalid id' }; },
  run: (ctx, v) => A.reverseDuesPosting(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, paymentId: v.id, reason: v.reason }),
});

defineTool({
  name: 'dues_recognition.post',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => ({ value: { month: b.month } }),
  run: (ctx, v) => A.postRecognition(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, month: v.month }),
});

defineTool({
  name: 'dues_recognition.reverse',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => ({ value: { month: b.month, reason: b.reason } }),
  run: (ctx, v) => A.reverseRecognition(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, month: v.month, reason: v.reason }),
});
