'use strict';
// Receipt wording and input checks for what a donor received in return for a gift.

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseBenefit, receiptStatement, NONE } = require('../../server/organizational/lib/giftBenefit');

test('a gift with no benefit says nothing was provided', () => {
  assert.equal(receiptStatement({ amount_cents: 10000 }).lines[0], NONE);
  assert.equal(receiptStatement({ amount_cents: 10000, benefit_value_cents: 0 }).benefit, false);
});

test('a gift with a benefit states its value and the deductible part', () => {
  const r = receiptStatement({ amount_cents: 10000, benefit_value_cents: 4000, benefit_description: 'dinner for two' });
  assert.equal(r.benefit, true);
  assert.match(r.lines[0], /\$100\.00.*dinner for two.*\$40\.00/);
  assert.match(r.lines[1], /\$60\.00/);
  assert.ok(!r.lines.join(' ').includes(NONE));
});

test('benefit input is checked against the amount paid', () => {
  assert.deepEqual(parseBenefit({}, 10000), { touched: false });
  assert.match(parseBenefit({ benefit_value: 150, benefit_description: 'x' }, 10000).error, /more than the amount/);
  assert.match(parseBenefit({ benefit_value: -1 }, 10000).error, /zero or more/);
  assert.match(parseBenefit({ benefit_value: 40 }, 10000).error, /Describe/);
  assert.deepEqual(parseBenefit({ benefit_value: 40, benefit_description: ' tickets ' }, 10000), { touched: true, value: 4000, description: 'tickets' });
  assert.deepEqual(parseBenefit({ benefit_value: '' }, 10000), { touched: true, value: null, description: undefined });
});
