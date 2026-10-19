'use strict';

// Fee rules as plain functions: percent, flat, tiered, quarterly minimum, exemptions, effective dates and what a run still owes.

const test = require('node:test');
const assert = require('node:assert/strict');
const f = require('../../server/organizational/lib/sponsorFees');

const pct = (rate, extra) => ({ kind: 'percent', rate, minimum_quarter_cents: 0, effective_from: '2026-01-01', ...extra });

test('fiscal quarters follow the fiscal year end month', () => {
  assert.deepEqual(f.quarterOf('2026-02-14', 12), { start: '2026-01-01', end: '2026-03-31' });
  assert.deepEqual(f.quarterOf('2026-07-01', 6), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(f.quarterOf('2026-12-01', 10), { start: '2026-11-01', end: '2027-01-31' });
  assert.equal(f.quartersBetween('2026-01-15', '2026-12-31', 12).length, 4);
});

test('percent of gross receipts, per quarter', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-01-10', cents: 100000 }, { date: '2026-02-10', cents: 50000 }, { date: '2026-04-05', cents: 20000 }],
    rules: [pct(6)], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-06-30',
  });
  assert.equal(periods.length, 2);
  assert.equal(periods[0].fee_cents, 9000);
  assert.equal(periods[0].gross_cents, 150000);
  assert.equal(periods[1].fee_cents, 1200);
  assert.ok(periods.every((p) => p.complete));
});

test('minimum per quarter tops up a complete quarter only', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-01-10', cents: 10000 }, { date: '2026-04-10', cents: 10000 }],
    rules: [pct(6, { minimum_quarter_cents: 5000 })], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-05-15',
  });
  assert.equal(periods[0].fee_cents, 5000);
  assert.equal(periods[0].minimum_applied, true);
  assert.equal(periods[1].complete, false);
  assert.equal(periods[1].fee_cents, 600);
});

test('minimum applies to a complete quarter with no money in', () => {
  const periods = f.computeQuarterFees({
    receipts: [], rules: [pct(6, { minimum_quarter_cents: 2500 })], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-03-31',
  });
  assert.equal(periods.length, 1);
  assert.equal(periods[0].fee_cents, 2500);
});

test('an exempt gift is counted as received but not charged', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-01-10', cents: 100000, exempt: true }, { date: '2026-01-11', cents: 100000 }],
    rules: [pct(10)], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-03-31',
  });
  assert.equal(periods[0].gross_cents, 200000);
  assert.equal(periods[0].exempt_cents, 100000);
  assert.equal(periods[0].fee_cents, 10000);
});

test('tiered rates are marginal over the fiscal year', () => {
  const rule = { kind: 'tiered', tiers: [{ up_to_cents: 1000000, rate: 8 }, { up_to_cents: null, rate: 5 }], minimum_quarter_cents: 0, effective_from: '2026-01-01' };
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-02-01', cents: 800000 }, { date: '2026-05-01', cents: 400000 }, { date: '2027-01-15', cents: 100000 }],
    rules: [rule], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2027-03-31',
  });
  assert.equal(periods[0].fee_cents, 64000);
  assert.equal(periods[1].fee_cents, 200000 * 0.08 + 200000 * 0.05);
  const q2027 = periods.find((p) => p.period_start === '2027-01-01');
  assert.equal(q2027.fee_cents, 8000);
});

test('flat fee is charged each complete quarter', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-01-10', cents: 999999 }],
    rules: [{ kind: 'flat', flat_cents: 30000, minimum_quarter_cents: 0, effective_from: '2026-01-01' }],
    fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-06-30',
  });
  assert.deepEqual(periods.map((p) => p.fee_cents), [30000, 30000]);
});

test('an amendment applies from its effective date', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-03-01', cents: 100000 }, { date: '2026-04-15', cents: 100000 }],
    rules: [pct(6), pct(4, { effective_from: '2026-04-01' })], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-06-30',
  });
  assert.deepEqual(periods.map((p) => p.fee_cents), [6000, 4000]);
});

test('the fallback rule is used before the first rule row', () => {
  const fb = f.fallbackRule({ admin_rate: null }, { default_admin_rate: null }, { default_fee_minimum_cents: 0 });
  assert.equal(fb.rate, 6);
  const periods = f.computeQuarterFees({ receipts: [{ date: '2026-01-10', cents: 10000 }], rules: [], fallback: fb, fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-03-31' });
  assert.equal(periods[0].fee_cents, 600);
});

test('fees due: nothing twice, a reversal makes it due again, a later change shows the difference', () => {
  const periods = f.computeQuarterFees({
    receipts: [{ date: '2026-01-10', cents: 100000 }], rules: [pct(6)], fyEndMonth: 12, startDate: '2026-01-01', throughDate: '2026-04-30',
  });
  assert.equal(f.feesDue(periods, [], '2026-04-30').length, 1);
  assert.equal(f.feesDue(periods, [{ period_end: '2026-03-31', amount_cents: 6000 }], '2026-04-30').length, 0);
  const diff = f.feesDue(periods, [{ period_end: '2026-03-31', amount_cents: 7000 }], '2026-04-30');
  assert.equal(diff[0].due_cents, -1000);
  assert.equal(f.feesDue(periods, [], '2026-03-30').length, 0);
});

test('rule validation gives plain messages', () => {
  assert.ok(f.validateRule({ kind: 'percent' }).error);
  assert.ok(f.validateRule({ kind: 'tiered', tiers: [{ up_to_cents: 500, rate: 5 }, { up_to_cents: 400, rate: 3 }] }).error);
  assert.equal(f.validateRule({ kind: 'percent', rate: 12.5 }).rule.rate, 12.5);
  const t = f.validateRule({ kind: 'tiered', tiers: [{ up_to_cents: 1000, rate: 8 }] }).rule.tiers;
  assert.equal(t[t.length - 1].up_to_cents, null);
});
