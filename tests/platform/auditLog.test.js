'use strict';
// logAudit writes bulk actions against the workspace and reports missing arguments.

const test = require('node:test');
const assert = require('node:assert');
const { logAudit } = require('../../server/organizational/lib/auditLog');

const fakePool = () => { const calls = []; return { calls, query: async (sql, params) => { calls.push(params); } }; };

test('an action with no record id is written against the workspace and marked bulk', async () => {
  const pool = fakePool();
  await logAudit(pool, { orgId: 7, userId: 3, action: 'create', tableName: 'org_budget_lines', recordId: null, metadata: { copied: 4 } });
  assert.strictEqual(pool.calls.length, 1);
  assert.strictEqual(pool.calls[0][4], 7);
  assert.deepStrictEqual(JSON.parse(pool.calls[0][5]), { copied: 4, bulk: true });
});

test('missing arguments are reported, not silently dropped', async () => {
  const pool = fakePool();
  const seen = [];
  const orig = console.error; console.error = (...a) => seen.push(a.join(' '));
  try { await logAudit(pool, { orgId: 7, userId: 3, tableName: 'x', recordId: 1 }); } finally { console.error = orig; }
  assert.strictEqual(pool.calls.length, 1, 'only the failure record is written');
  assert.match(pool.calls[0][5], /action/);
  assert.ok(seen.some((m) => m.includes('action')));
});
