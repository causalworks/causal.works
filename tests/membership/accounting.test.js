'use strict';

// Dues accounting rules: how a payment splits, how a refund mirrors it, and how much is recognised by each month end.

const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../server/organizational/lib/membershipAccounting');

const term = { starts_on: '2026-07-01', ends_on: '2027-06-30', price_cents: 36500, contribution_cents: 0 };

test('spread mode: the exchange part is deferred and the contribution part is separate', () => {
  assert.deepEqual(A.splitPayment(36500, term, { recognition_mode: 'spread' }, '2026-07-05'), { contribution: 0, deferred: 36500, revenue: 0 });
  const pwyc = { ...term, price_cents: 50000, contribution_cents: 20000 };
  assert.deepEqual(A.splitPayment(50000, pwyc, { recognition_mode: 'spread' }, '2026-07-05'), { contribution: 20000, deferred: 30000, revenue: 0 });
  assert.deepEqual(A.splitPayment(25000, pwyc, { recognition_mode: 'spread' }, '2026-07-05'), { contribution: 10000, deferred: 15000, revenue: 0 });
});

test('at-receipt mode: revenue once the term has started; paid before the start it waits in the liability', () => {
  assert.deepEqual(A.splitPayment(36500, term, { recognition_mode: 'at_receipt' }, '2026-07-01'), { contribution: 0, deferred: 0, revenue: 36500 });
  assert.deepEqual(A.splitPayment(36500, term, { recognition_mode: 'at_receipt' }, '2026-06-20'), { contribution: 0, deferred: 36500, revenue: 0 });
});

test('a refund mirrors the split of the payment it refunds', () => {
  const orig = { amount_cents: 50000, posted_contribution_cents: 20000, posted_deferred_cents: 30000 };
  assert.deepEqual(A.splitRefund(10000, orig), { contribution: 4000, deferred: 6000, revenue: 0 });
  assert.deepEqual(A.splitRefund(50000, orig), { contribution: 20000, deferred: 30000, revenue: 0 });
});

test('recognition by day: a July-to-June term splits across two fiscal years in proportion to days', () => {
  const s = { recognition_mode: 'spread' };
  assert.equal(A.recognitionTarget(term, 36500, '2026-06-30', s), 0);
  assert.equal(A.recognitionTarget(term, 36500, '2026-07-31', s), 3100);
  assert.equal(A.recognitionTarget(term, 36500, '2026-12-31', s), 18400);
  assert.equal(A.recognitionTarget(term, 36500, '2027-06-30', s), 36500);
  assert.equal(A.recognitionTarget(term, 36500, '2027-09-30', s), 36500);
  assert.equal(A.recognitionTarget(term, 36500, '2026-12-31', { recognition_mode: 'at_receipt' }), 36500);
  assert.equal(A.monthEnd('2027-02'), '2027-02-28');
});
