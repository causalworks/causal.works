'use strict';

// Sponsorship overview rules as plain functions: project flags, what needs attention, the fee shown in the grid, the totals.

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectFlags, needsAttention, needsAgreement, feeOut, totalsOf } = require('../../server/organizational/lib/sponsorOverview');

test('flags: hold, negative, missing agreement, overdue report and standing', () => {
  const f = projectFlags({
    project: { status: 'on_hold', agreement_signed_at: null },
    balance: { negative: true },
    reports: [{ status: 'due_soon' }, { status: 'overdue' }],
    standing: { good: false },
  });
  assert.deepEqual(f, { hold: true, negative: true, agreement_missing: true, report_overdue: true, good_standing: false });
  assert.equal(needsAttention(f), true);
});

test('a signed, active project with no overdue report needs no attention; standing alone does not count', () => {
  const f = projectFlags({ project: { status: 'active', agreement_signed_at: '2026-01-01' }, balance: { negative: false }, reports: [{ status: 'upcoming' }], standing: { good: false } });
  assert.equal(needsAttention(f), false);
  assert.equal(f.good_standing, false);
});

test('an applicant or ended project does not need an agreement', () => {
  assert.equal(needsAgreement({ status: 'applicant', agreement_signed_at: null }), false);
  assert.equal(needsAgreement({ status: 'ended', agreement_signed_at: null }), false);
  assert.equal(needsAgreement({ status: 'accepted', agreement_signed_at: null }), true);
});

test('fee: the current rule wins; otherwise the project rate, then the workspace default', () => {
  assert.deepEqual(feeOut({ kind: 'flat', rate: null, flat_cents: '30000', minimum_quarter_cents: 0 }, {}, 6),
    { kind: 'flat', rate: null, flat_cents: 30000, minimum_quarter_cents: 0, from_rule: true });
  assert.equal(feeOut(null, { admin_rate: '8' }, 6).rate, 8);
  assert.equal(feeOut(null, { admin_rate: null }, '6.5').rate, 6.5);
  assert.equal(feeOut(null, { admin_rate: null }, null).rate, null);
});

test('totals add the project rows and count the ones needing attention', () => {
  const t = totalsOf([
    { held_cents: 100000, available_cents: 80000, fees_due_cents: 600, attention: false },
    { held_cents: -5000, available_cents: -5000, fees_due_cents: 0, attention: true },
  ]);
  assert.deepEqual(t, { held_cents: 95000, available_cents: 75000, fees_due_cents: 600, attention_count: 1, project_count: 2 });
});
