'use strict';

// Tool that codes an unconfirmed bank statement line and posts its entry; an assistant or job proposes it, a person runs it.

const { defineTool } = require('./registry');
const { parseSplits, codeLineAsCreate } = require('../lib/bankLineCoding');
const { acquireDocumentLock } = require('../lib/documentLock');

defineTool({
  name: 'bank_line.code',
  capability: 'post',
  nonHuman: 'propose',
  validate: (body) => {
    const lineId = Number.parseInt(String(body.line_id), 10);
    if (!Number.isInteger(lineId) || lineId < 1) return { error: 'invalid line id' };
    const { error, splits } = parseSplits(body);
    if (error) return { error };
    return {
      value: {
        lineId, splits,
        memo: body.memo != null ? String(body.memo) : null,
        payee: body.payee != null ? String(body.payee) : null,
        referenceNumber: body.reference_number != null ? String(body.reference_number) : null,
        codingSource: body.coding_source === 'rule' ? 'rule' : 'manual',
        appliedRuleId: body.applied_rule_id != null ? Number.parseInt(String(body.applied_rule_id), 10) : null,
      },
    };
  },
  run: async (ctx, v) => {
    const lock = await acquireDocumentLock(ctx.pool, 'bankline:' + v.lineId);
    try {
      return await codeLineAsCreate(ctx.pool, ctx.orgId, ctx.userId, v.lineId, v);
    } finally { await lock.release(); }
  },
});
