'use strict';

// Project balance as a plain function: every component, the tie-out line, and a negative balance.

const test = require('node:test');
const assert = require('node:assert/strict');
const { computeBalance, explainTieOut } = require('../../server/organizational/lib/sponsorBalance');

const base = {
  receipts: [{ cents: 100000, posted: true }, { cents: 50000, posted: true }, { cents: 20000, posted: false }],
  feePeriods: [{ fee_cents: 9000 }],
  feePostings: [{ amount_cents: 6000, live: true }, { amount_cents: 3000, live: false }],
  disbursements: [
    { status: 'approved', posted: true, amount_cents: 40000 },
    { status: 'approved', posted: false, amount_cents: 10000 },
    { status: 'pending_approval', posted: false, amount_cents: 5000 },
  ],
  requests: [{ status: 'submitted', amount_cents: 2000 }, { status: 'approved', amount_cents: 1000, disbursement_id: 9 }, { status: 'rejected', amount_cents: 7000 }],
  otherSpendingCents: 3000,
  ledgerNetCents: 101000,
  openPledgeCents: 0,
};

const cases = [
  ['received, posted', 'received_posted_cents', 150000],
  ['received, not yet posted', 'received_unposted_cents', 20000],
  ['fees accrued', 'fees_accrued_cents', 9000],
  ['fees posted (reversed ones left out)', 'fees_posted_cents', 6000],
  ['fees not yet posted', 'fees_unposted_cents', 3000],
  ['disbursed, posted', 'disbursed_posted_cents', 40000],
  ['pending disbursements', 'pending_disbursements_cents', 15000],
  ['pending requests (not yet a disbursement)', 'pending_requests_cents', 2000],
  ['pending total', 'pending_cents', 17000],
  ['other spending in the books (bills paid directly)', 'other_spending_cents', 3000],
  ['available', 'available_cents', 150000 - 9000 - 40000 - 3000 - 17000],
];

for (const [name, key, want] of cases) {
  test('balance component: ' + name, () => {
    assert.equal(computeBalance(base)[key], want);
  });
}

test('tie-out agrees when the ledger net matches posted money in, fees and money out', () => {
  const b = computeBalance(base);
  assert.equal(b.tie_out.expected_cents, 150000 - 6000 - 40000 - 3000);
  assert.equal(b.tie_out.difference_cents, 0);
  assert.equal(explainTieOut(b.tie_out), 'Agrees with the books.');
});

test('tie-out difference is explained: open pledges first, then other entries on the program', () => {
  const b = computeBalance({ ...base, ledgerNetCents: 101000 + 25000 + 1500, openPledgeCents: 25000 });
  assert.equal(b.tie_out.difference_cents, 26500);
  assert.equal(b.tie_out.unexplained_cents, 1500);
  const text = explainTieOut(b.tie_out, { sharedProgram: true });
  assert.match(text, /pledges booked/);
  assert.match(text, /another project uses the same program/);
});

test('no program means no tie-out', () => {
  const b = computeBalance({ ...base, ledgerNetCents: null });
  assert.equal(b.tie_out.difference_cents, null);
  assert.match(explainTieOut(b.tie_out), /Link this project to a program/);
});

test('posted fees larger than accrued (a gift later voided) still count as charged', () => {
  const b = computeBalance({ ...base, feePeriods: [{ fee_cents: 2000 }] });
  assert.equal(b.available_cents, 150000 - 6000 - 40000 - 3000 - 17000);
});

test('a negative balance is flagged', () => {
  const b = computeBalance({ receipts: [{ cents: 1000, posted: true }], feePeriods: [{ fee_cents: 2500 }], feePostings: [], disbursements: [], requests: [] });
  assert.equal(b.available_cents, -1500);
  assert.equal(b.negative, true);
});
