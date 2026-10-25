'use strict';

// Tool that posts the indirect cost recovery entries for a period. The recovery library holds its own lock.

const { defineTool } = require('./registry');
const { runIndirectRecovery } = require('../lib/indirectCostRecovery');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const intOrNull = (v) => (v != null ? Number.parseInt(String(v), 10) : null);

defineTool({
  name: 'indirect_cost_recovery.run',
  capability: 'post',
  nonHuman: 'propose',
  validate: (b) => {
    const periodStart = b.period_start_date != null ? String(b.period_start_date) : null;
    const periodEnd = b.period_end_date != null ? String(b.period_end_date) : null;
    if (!periodStart || !DATE_RE.test(periodStart) || !periodEnd || !DATE_RE.test(periodEnd)) {
      return { error: 'period_start_date and period_end_date are required and must be YYYY-MM-DD' };
    }
    const debitAccountId = intOrNull(b.debit_account_id);
    const creditAccountId = intOrNull(b.credit_account_id);
    const programId = intOrNull(b.program_id);
    if (!Number.isInteger(debitAccountId) || !Number.isInteger(creditAccountId) || !Number.isInteger(programId)) {
      return { error: 'debit_account_id, credit_account_id, and program_id are all required' };
    }
    return { value: { periodStart, periodEnd, debitAccountId, creditAccountId, programId } };
  },
  run: async (ctx, v) => {
    const { posted, failed } = await runIndirectRecovery(ctx.pool, {
      orgId: ctx.orgId, userId: ctx.userId, periodStartDate: v.periodStart, periodEndDate: v.periodEnd,
      debitAccountId: v.debitAccountId, creditAccountId: v.creditAccountId, programId: v.programId,
    });
    await logAudit(ctx.pool, { orgId: ctx.orgId, userId: ctx.userId, action: 'create', tableName: 'org_ledger_transactions',
      metadata: { ...ctx.meta, source: 'indirect_cost_recovery', period_start_date: v.periodStart, period_end_date: v.periodEnd, posted_count: posted.length, failed_count: failed.length } });
    return { httpStatus: 200, body: { posted, failed, posted_count: posted.length, failed_count: failed.length } };
  },
});
