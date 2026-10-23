'use strict';
// Retention end date: one calculation, counted from the end of the fiscal year the record falls in.

const test = require('node:test');
const assert = require('node:assert');
const { resolveRetention } = require('../../server/organizational/lib/documentRetention');

const db = {
  query: async (q) => (q.includes('org_settings')
    ? { rows: [{ fiscal_year_end_month: 6 }] }
    : { rows: [{ retention_class: 'fixed_term', retention_years: 7, trigger: 'year_end' }] }),
};

test('rule default counts from fiscal year end', async () => {
  const r = await resolveRetention(db, 1, 'x', '2025-03-10');
  assert.strictEqual(r.retention_until, '2032-06-30');
});

test('explicit years use the same start date', async () => {
  const r = await resolveRetention(db, 1, 'x', '2025-09-10', { retention_class: 'fixed_term', retention_years: 3 });
  assert.strictEqual(r.retention_until, '2029-06-30');
});

test('date objects from the database are accepted', async () => {
  const r = await resolveRetention(db, 1, 'x', new Date('2025-03-10'));
  assert.strictEqual(r.retention_until, '2032-06-30');
});

test('permanent has no end date', async () => {
  const r = await resolveRetention(db, 1, 'x', '2025-03-10', { retention_class: 'permanent' });
  assert.strictEqual(r.retention_until, null);
});
