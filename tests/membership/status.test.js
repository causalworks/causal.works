'use strict';

// Dues-member status, term dates and proration rules.

const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../../server/organizational/lib/membershipStatus');

const ROLLING = { year_mode: 'rolling', grace_days: 30, renewal_window_days: 60, proration_mode: 'none' };
const FIXED = { year_mode: 'fixed', fixed_start_month: 7, fixed_start_day: 1, grace_days: 30, renewal_window_days: 45, proration_mode: 'monthly' };

// --- Term dates ---

test('rolling join runs twelve months from the start date', () => {
  assert.deepEqual(M.joinTermDates('2026-03-15', ROLLING), { starts_on: '2026-03-15', ends_on: '2027-03-14', year_start: '2026-03-15' });
  assert.equal(M.joinTermDates('2028-02-29', ROLLING).ends_on, '2029-02-27');
  assert.equal(M.joinTermDates('2026-01-31', ROLLING).ends_on, '2027-01-30');
});

test('fixed-year join ends on the day before the next year start', () => {
  assert.deepEqual(M.joinTermDates('2026-10-10', FIXED), { starts_on: '2026-10-10', ends_on: '2027-06-30', year_start: '2026-07-01' });
  assert.deepEqual(M.joinTermDates('2026-07-01', FIXED), { starts_on: '2026-07-01', ends_on: '2027-06-30', year_start: '2026-07-01' });
  assert.deepEqual(M.joinTermDates('2026-02-01', FIXED), { starts_on: '2026-02-01', ends_on: '2026-06-30', year_start: '2025-07-01' });
});

test('fixed-year join inside the signup window starts on the next year', () => {
  assert.deepEqual(M.joinTermDates('2026-06-01', FIXED), { starts_on: '2026-07-01', ends_on: '2027-06-30', year_start: '2026-07-01' });
  assert.equal(M.joinTermDates('2026-05-17', FIXED).starts_on, '2026-07-01');
  assert.equal(M.joinTermDates('2026-05-16', FIXED).starts_on, '2026-05-16');
});

test('renewal follows on without a gap, or starts fresh after a lapse', () => {
  assert.deepEqual(M.renewalTermDates('2027-03-14', '2027-02-01', ROLLING), { starts_on: '2027-03-15', ends_on: '2028-03-14', year_start: '2027-03-15' });
  assert.deepEqual(M.renewalTermDates('2027-03-14', '2027-04-10', ROLLING).starts_on, '2027-03-15');
  assert.deepEqual(M.renewalTermDates('2027-03-14', '2027-05-01', ROLLING).starts_on, '2027-05-01');
  assert.deepEqual(M.renewalTermDates('2027-06-30', '2027-06-01', FIXED), { starts_on: '2027-07-01', ends_on: '2028-06-30', year_start: '2027-07-01' });
  assert.deepEqual(M.renewalTermDates('2027-06-30', '2027-10-01', FIXED).starts_on, '2027-10-01');
});

test('renewal window opens N days before the next term', () => {
  assert.equal(M.renewalOpen('2027-06-30', '2027-05-17', FIXED), true);
  assert.equal(M.renewalOpen('2027-06-30', '2027-05-16', FIXED), false);
  assert.equal(M.renewalOpen('2027-03-14', '2027-01-14', ROLLING), true);
  assert.equal(M.renewalOpen('2027-03-14', '2027-01-13', ROLLING), false);
});

test('monthly proration counts months left including the start month', () => {
  assert.equal(M.proratedPriceCents(12000, '2026-07-01', '2026-07-01', FIXED), 12000);
  assert.equal(M.proratedPriceCents(12000, '2026-10-10', '2026-07-01', FIXED), 9000);
  assert.equal(M.proratedPriceCents(12000, '2027-06-20', '2026-07-01', FIXED), 1000);
  assert.equal(M.proratedPriceCents(10000, '2026-08-01', '2026-07-01', FIXED), 9167);
  assert.equal(M.proratedPriceCents(12000, '2026-10-10', '2026-07-01', { ...FIXED, proration_mode: 'none' }), 12000);
  assert.equal(M.proratedPriceCents(12000, '2026-10-10', '2026-10-10', ROLLING), 12000);
});

// --- Status: every date and payment combination, both year modes ---

const PRICE = 10000;
const PAYMENT_CASES = [
  { name: 'nothing paid', price: PRICE, payments: [], settled: false },
  { name: 'partly paid', price: PRICE, payments: [{ kind: 'payment', amount_cents: 4000 }], settled: false },
  { name: 'paid in full', price: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE }], settled: true },
  { name: 'paid in two parts', price: PRICE, payments: [{ kind: 'payment', amount_cents: 6000 }, { kind: 'payment', amount_cents: 4000 }], settled: true },
  { name: 'overpaid', price: PRICE, payments: [{ kind: 'payment', amount_cents: 15000 }], settled: true },
  { name: 'paid with a discount', price: PRICE, payments: [{ kind: 'payment', amount_cents: 8000, discount_cents: 2000 }], settled: true },
  { name: 'free tier', price: 0, payments: [], settled: true },
  { name: 'waived and approved', price: PRICE, payments: [{ kind: 'waiver', amount_cents: PRICE, approved_at: '2026-01-01' }], settled: true },
  { name: 'waiver awaiting approval', price: PRICE, payments: [{ kind: 'waiver', amount_cents: PRICE }], settled: false },
  { name: 'part paid, part waived', price: PRICE, payments: [{ kind: 'payment', amount_cents: 5000 }, { kind: 'waiver', amount_cents: 5000, approved_at: '2026-01-01' }], settled: true },
  { name: 'paid then refunded', price: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE }, { kind: 'refund', amount_cents: PRICE }], settled: false },
  { name: 'paid then partly refunded', price: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE }, { kind: 'refund', amount_cents: 1 }], settled: false },
  { name: 'payment voided', price: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE, posting_status: 'void' }], settled: false },
  { name: 'refund voided', price: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE }, { kind: 'refund', amount_cents: PRICE, posting_status: 'void' }], settled: true },
];

// Offsets are days relative to the term start (s) or end (e).
const DATE_CASES = [
  { name: 'a month before start', at: (t) => M.addDays(t.starts_on, -30), settled: 'upcoming', unsettled: 'pending', member: { settled: 'pending', unsettled: 'pending' } },
  { name: 'day before start', at: (t) => M.addDays(t.starts_on, -1), settled: 'upcoming', unsettled: 'pending', member: { settled: 'pending', unsettled: 'pending' } },
  { name: 'start day', at: (t) => t.starts_on, settled: 'active', unsettled: 'pending', member: { settled: 'active', unsettled: 'pending' } },
  { name: 'mid term', at: (t) => M.addDays(t.starts_on, 100), settled: 'active', unsettled: 'pending', member: { settled: 'active', unsettled: 'pending' } },
  { name: 'end day', at: (t) => t.ends_on, settled: 'active', unsettled: 'pending', member: { settled: 'active', unsettled: 'pending' } },
  { name: 'day after end', at: (t) => M.addDays(t.ends_on, 1), settled: 'grace', unsettled: 'lapsed', member: { settled: 'grace', unsettled: 'lapsed' } },
  { name: 'last grace day', at: (t) => M.addDays(t.ends_on, 30), settled: 'grace', unsettled: 'lapsed', member: { settled: 'grace', unsettled: 'lapsed' } },
  { name: 'first day after grace', at: (t) => M.addDays(t.ends_on, 31), settled: 'lapsed', unsettled: 'lapsed', member: { settled: 'lapsed', unsettled: 'lapsed' } },
  { name: 'a year after end', at: (t) => M.addDays(t.ends_on, 365), settled: 'lapsed', unsettled: 'lapsed', member: { settled: 'lapsed', unsettled: 'lapsed' } },
];

for (const [modeName, settings, joinDay] of [['rolling', ROLLING, '2026-03-15'], ['fixed year', FIXED, '2026-10-10'], ['fixed year, early join', FIXED, '2026-06-01']]) {
  const dates = M.joinTermDates(joinDay, settings);
  for (const pc of PAYMENT_CASES) {
    for (const dc of DATE_CASES) {
      test(`${modeName}: ${pc.name}, ${dc.name}`, () => {
        const term = { id: 1, ...dates, price_cents: pc.price, payments: pc.payments };
        const today = dc.at(dates);
        const key = pc.settled ? 'settled' : 'unsettled';
        assert.equal(M.isSettled(term), pc.settled);
        assert.equal(M.termState(term, today, settings), dc[key]);
        assert.equal(M.memberStatus([term], today, settings).status, dc.member[key]);
        const ended = { ...term, status_override: 'ended' };
        assert.equal(M.termState(ended, today, settings), 'ended');
        assert.equal(M.memberStatus([ended], today, settings).status, 'ended');
      });
    }
  }
}

// --- Status across several terms ---

const paid = (id, starts_on, ends_on) => ({ id, starts_on, ends_on, price_cents: PRICE, payments: [{ kind: 'payment', amount_cents: PRICE }] });
const unpaid = (id, starts_on, ends_on) => ({ id, starts_on, ends_on, price_cents: PRICE, payments: [] });

test('billed but unpaid renewal keeps grace, then lapses', () => {
  const terms = [paid(1, '2025-07-01', '2026-06-30'), unpaid(2, '2026-07-01', '2027-06-30')];
  assert.equal(M.memberStatus(terms, '2026-06-15', FIXED).status, 'active');
  assert.equal(M.memberStatus(terms, '2026-07-10', FIXED).status, 'grace');
  assert.equal(M.memberStatus(terms, '2026-07-31', FIXED).status, 'pending');
});

test('paid renewal makes the dues member active from the next term start', () => {
  const terms = [paid(1, '2025-07-01', '2026-06-30'), paid(2, '2026-07-01', '2027-06-30')];
  assert.equal(M.memberStatus(terms, '2026-07-01', FIXED).status, 'active');
  assert.equal(M.memberStatus(terms, '2026-07-01', FIXED).term.id, 2);
  assert.equal(M.memberStatus(terms, '2027-08-15', FIXED).status, 'lapsed');
});

test('ended term shows ended until a new term starts', () => {
  const ended = { ...paid(1, '2026-01-01', '2026-12-31'), status_override: 'ended' };
  assert.equal(M.memberStatus([ended], '2026-05-01', ROLLING).status, 'ended');
  const rejoin = paid(2, '2027-02-01', '2028-01-31');
  assert.equal(M.memberStatus([ended, rejoin], '2027-03-01', ROLLING).status, 'active');
});

test('no terms gives no status', () => {
  assert.equal(M.memberStatus([], '2026-01-01', ROLLING), null);
});

test('covered amount can be given directly', () => {
  assert.equal(M.isSettled({ price_cents: PRICE, covered_cents: PRICE }), true);
  assert.equal(M.isSettled({ price_cents: PRICE, covered_cents: PRICE - 1 }), false);
});

test('grace days of zero lapse the day after the term ends', () => {
  const t = paid(1, '2026-01-01', '2026-12-31');
  assert.equal(M.memberStatus([t], '2027-01-01', { ...ROLLING, grace_days: 0 }).status, 'lapsed');
});

test('renewal base skips ended terms', () => {
  const a = paid(1, '2025-01-01', '2025-12-31');
  const b = { ...paid(2, '2026-01-01', '2026-12-31'), status_override: 'ended' };
  assert.equal(M.renewalBase([a, b]).id, 1);
});

test('a monthly instalment plan counts as settled while instalments are paid, and for a short time after a failure', () => {
  const t = { id: 1, starts_on: '2026-01-01', ends_on: '2026-12-31', price_cents: 12000, instalment_plan: 'monthly', payments: [{ kind: 'payment', amount_cents: 1000 }] };
  assert.equal(M.termState(t, '2026-03-01', ROLLING), 'active');
  assert.equal(M.termState({ ...t, payments: [] }, '2026-03-01', ROLLING), 'pending');
  const failed = { ...t, payment_failed_at: '2026-03-01T10:00:00Z' };
  assert.equal(M.termState(failed, '2026-03-15', ROLLING), 'active');
  assert.equal(M.termState(failed, '2026-03-16', ROLLING), 'pending');
  assert.equal(M.termState({ ...t, instalment_plan: null }, '2026-03-01', ROLLING), 'pending');
});

test('a term ended by staff counts as ended from its end date', () => {
  const t = { id: 1, starts_on: '2026-01-01', ends_on: '2026-12-31', price_cents: 0, payments: [], status_override: 'ended', status_reason: 'Moved', ended_on: '2026-06-01' };
  assert.equal(M.termState(t, '2026-05-31', ROLLING), 'active');
  assert.equal(M.termState(t, '2026-06-01', ROLLING), 'ended');
  assert.equal(M.memberStatus([t], '2026-05-31', ROLLING).status, 'active');
});
