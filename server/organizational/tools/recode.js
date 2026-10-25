'use strict';

// Tool that moves posted ledger lines to another account, program or grant through a correcting journal.

const { defineTool } = require('./registry');
const { previewLedgerRecode, executeLedgerRecode } = require('../lib/findAndRecode');
const { acquireDocumentLock } = require('../lib/documentLock');
const { logAudit } = require('../lib/auditLog');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseChanges(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const changes = {};
  for (const f of ['account_id', 'program_id', 'grant_id']) {
    if (src[f] === undefined) continue;
    if (src[f] === null || src[f] === '') { changes[f] = null; continue; }
    const n = Number.parseInt(String(src[f]), 10);
    if (!Number.isInteger(n) || n < 1) return { error: `changes.${f} must be a positive integer or null` };
    changes[f] = n;
  }
  return { changes };
}

defineTool({
  name: 'ledger.recode',
  capability: 'post',
  nonHuman: 'propose',
  validate: (body) => {
    const lineIds = Array.isArray(body.line_ids) ? body.line_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (lineIds.length === 0) return { error: 'line_ids is required' };
    const date = body.transaction_date != null ? String(body.transaction_date) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(date)) return { error: 'transaction_date must be YYYY-MM-DD' };
    const parsed = parseChanges(body.changes);
    if (parsed.error) return { error: parsed.error };
    if (Object.keys(parsed.changes).length === 0) return { error: 'changes must include at least one of account_id, program_id, grant_id' };
    return { value: { lineIds, date, changes: parsed.changes } };
  },
  run: async (ctx, v) => {
    const lock = await acquireDocumentLock(ctx.pool, 'recode:' + ctx.orgId);
    try {
      const preview = await previewLedgerRecode(ctx.pool, ctx.orgId, v.lineIds, v.changes);
      if (preview.hasConflicts) {
        const error = preview.targetIsSystemAccount
          ? 'System accounts (AR, AP, Bank, Clearing, Contribution Revenue, Expense Claims Payable) cannot be a recode target.'
          : 'Some selected lines are not posted, or nothing was found for the given selection.';
        return { httpStatus: 409, body: { error, code: 'recode_conflicts', ...preview } };
      }
      const result = await executeLedgerRecode(ctx.pool, ctx.orgId, ctx.userId, v.lineIds, v.changes, v.date);
      if (result.httpStatus !== 201) return result;
      logAudit(ctx.pool, {
        orgId: ctx.orgId, userId: ctx.userId, action: 'update', tableName: 'org_ledger_lines', recordId: v.lineIds[0],
        fields: [{ fieldName: 'recode', oldValue: null, newValue: JSON.stringify(v.changes) }],
        metadata: { ...ctx.meta, operation: 'recode', line_ids: v.lineIds, correcting_journal_id: result.body.id },
      }).catch(() => {});
      return { httpStatus: 201, body: { ok: true, correcting_journal_id: result.body.id, line_count: v.lineIds.length } };
    } finally { await lock.release(); }
  },
});

module.exports = { parseChanges };
