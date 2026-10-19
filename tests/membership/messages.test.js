'use strict';

// Which scheduled membership messages are due on a day.

const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../../server/organizational/lib/membershipStatus');
const Msg = require('../../server/organizational/lib/membershipMessages');

const SETTINGS = { year_mode: 'rolling', grace_days: 30 };
const TPL = Msg.DEFAULT_TEMPLATES.map((t) => ({ ...t, enabled: true }));
const paid = { kind: 'payment', amount_cents: 5000 };
const term = (extra) => ({ id: 1, starts_on: '2026-01-01', ends_on: '2026-12-31', price_cents: 5000, payments: [paid], source: 'staff', created_at: '2025-12-20T10:00:00Z', ...extra });
const keys = (terms, day, tpl) => Msg.dueMessages(terms, day, SETTINGS, tpl || TPL).map((d) => d.template.key).sort();

test('renewal notices follow the end date, each inside its catch-up window', () => {
  assert.deepEqual(keys([term()], '2026-11-01'), ['renewal_60']);
  assert.deepEqual(keys([term()], '2026-11-08'), ['renewal_60']);
  assert.deepEqual(keys([term()], '2026-11-09'), []);
  assert.deepEqual(keys([term()], '2026-12-01'), ['renewal_30']);
  assert.deepEqual(keys([term()], '2026-12-31'), ['renewal_0']);
  assert.deepEqual(keys([term()], '2027-01-15'), ['grace_15']);
  assert.deepEqual(keys([term()], '2027-03-01'), ['win_back_60']);
  assert.deepEqual(keys([term()], '2026-06-01'), []);
});

test('the series stops when the renewal is paid; a billed but unpaid renewal does not stop it', () => {
  const renewal = { id: 2, starts_on: '2027-01-01', ends_on: '2027-12-31', price_cents: 5000, source: 'renewal', created_at: '2026-11-10T00:00:00Z' };
  assert.deepEqual(keys([term(), { ...renewal, payments: [] }], '2026-12-01'), ['renewal_30']);
  assert.deepEqual(keys([term(), { ...renewal, payments: [paid] }], '2026-12-01'), []);
});

test('automatic renewal skips the renewal notices; an unpaid or ended term gets none; disabled templates are skipped', () => {
  assert.deepEqual(keys([term({ auto_renew: true, processor_subscription_ref: 'sub_1' })], '2026-12-01'), []);
  assert.deepEqual(keys([term({ payments: [] })], '2026-12-01'), []);
  assert.deepEqual(keys([term({ status_override: 'ended', status_reason: 'Moved' })], '2026-12-01'), []);
  const off = TPL.map((t) => (t.key === 'renewal_30' ? { ...t, enabled: false } : t));
  assert.deepEqual(keys([term()], '2026-12-01', off), []);
});

test('welcome goes to a new joiner once, not to imported terms; failed-payment notices on days 0, 3 and 7', () => {
  assert.deepEqual(keys([term({ created_at: '2026-01-02T09:00:00Z', starts_on: '2026-01-02' })], '2026-01-02'), ['welcome']);
  assert.deepEqual(keys([term({ created_at: '2026-01-02T09:00:00Z', source: 'import' })], '2026-01-02'), []);
  const failed = term({ payment_failed_at: '2026-05-10T12:00:00Z' });
  assert.deepEqual(keys([failed], '2026-05-10'), ['failed_payment_0']);
  assert.deepEqual(keys([failed], '2026-05-13'), ['failed_payment_0', 'failed_payment_3']);
  assert.deepEqual(keys([failed], '2026-05-17'), ['failed_payment_0', 'failed_payment_3', 'failed_payment_7']);
  assert.deepEqual(keys([failed], '2026-05-25'), []);
});

test('merge fields are filled and unknown ones are left empty', () => {
  assert.equal(Msg.render('Hi {{first_name}}, {{ tier }} ends {{ends_on}}{{nope}}.', { first_name: 'Friend', tier: 'Standard', ends_on: '2026-12-31' }), 'Hi Friend, Standard ends 2026-12-31.');
});
