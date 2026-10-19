'use strict';

// Sponsorship S4 rules as plain functions: statement figures, donor-letter rule, receipt wording, year-end export.

const test = require('node:test');
const assert = require('node:assert/strict');
const { periodFigures, monthBounds, yearEndCsv } = require('../../server/organizational/lib/sponsorStatements');
const { needsDonorLetter, sponsoredReceiptLines, donorLetterTemplate } = require('../../server/organizational/lib/sponsorGifts');
const { buildAcknowledgmentHtml } = require('../../server/organizational/lib/sendGiftAcknowledgment');

const bal = (o) => ({ received_posted_cents: 0, fees_accrued_cents: 0, fees_posted_cents: 0, disbursed_posted_cents: 0, recalled_posted_cents: 0, other_spending_cents: 0, pending_cents: 0, ...o });

test('statement figures: opening + income - fees - expenses = closing', () => {
  const before = bal({ received_posted_cents: 100000, fees_accrued_cents: 6000, disbursed_posted_cents: 20000 });
  const after = bal({ received_posted_cents: 150000, fees_accrued_cents: 9000, fees_posted_cents: 6000, disbursed_posted_cents: 50000, other_spending_cents: 1000, pending_cents: 700 });
  const f = periodFigures(before, after);
  assert.deepEqual([f.opening_cents, f.income_cents, f.fees_cents, f.expenses_cents, f.closing_cents, f.committed_cents], [74000, 50000, 3000, 31000, 90000, 700]);
  assert.equal(f.opening_cents + f.income_cents - f.fees_cents - f.expenses_cents, f.closing_cents);
});

test('month bounds', () => {
  assert.deepEqual(monthBounds('2026-02'), { start: '2026-02-01', end: '2026-02-28' });
  assert.deepEqual(monthBounds('2024-02'), { start: '2024-02-01', end: '2024-02-29' });
});

test('donor letter needed only for project gifts above the threshold by check, transfer or wire', () => {
  const g = { sponsored_project_id: 1, payment_method: 'check', amount_cents: 600000, posting_status: 'posted' };
  assert.equal(needsDonorLetter(g, 500000), true);
  assert.equal(needsDonorLetter({ ...g, amount_cents: 500000 }, 500000), false);
  assert.equal(needsDonorLetter({ ...g, payment_method: 'credit_card' }, 500000), false);
  assert.equal(needsDonorLetter({ ...g, sponsored_project_id: null }, 500000), false);
  assert.match(donorLetterTemplate({ sponsorName: 'The workspace', projectName: 'Project A', donorName: null, amountCents: 600000, date: '2026-03-01', method: 'wire' }),
    /gift of \$6,000\.00 by wire on 2026-03-01 to The workspace[\s\S]*purposes of Project A[\s\S]*not made for the benefit of any particular person/);
});

test('receipt names the sponsor as recipient and the project as purpose; a noncash receipt states no value', () => {
  const lines = sponsoredReceiptLines({ sponsorName: 'The workspace', projectName: 'Project A', inKind: true, description: 'two laptops' });
  assert.match(lines.join(' '), /received your donation of two laptops/);
  assert.match(lines.join(' '), /does not state its value/);
  assert.match(lines.join(' '), /made to The workspace, which holds it as fiscal sponsor for Project A/);
  const html = buildAcknowledgmentHtml({
    gift: { amount_cents: 250000, received_at: '2026-03-01T12:00:00Z' }, constituent: { display_name: 'Donor one' }, org: { display_name: 'The workspace' },
    info: null, sponsored: { projectName: 'Project A', inKind: true, description: 'two laptops' },
  });
  assert.doesNotMatch(html, /\$2,500/);
  assert.match(html, /fiscal sponsor for Project A/);
  const cash = buildAcknowledgmentHtml({ gift: { amount_cents: 250000, received_at: '2026-03-01T12:00:00Z' }, constituent: { display_name: 'Donor one' }, org: { display_name: 'The workspace' }, info: null });
  assert.match(cash, /\$2,500\.00/);
  assert.doesNotMatch(cash, /fiscal sponsor/);
});

test('year-end CSV', () => {
  const csv = yearEndCsv({ rows: [{ project_name: 'Project, A', opening_cents: 0, income_cents: 150000, noncash_cents: 0, fees_cents: 9000, expenses_cents: 40000, closing_cents: 101000, ledger_net_cents: 101000, difference_cents: 0 }] });
  const lines = csv.trim().split('\n');
  assert.equal(lines[0].split(',')[0], 'Project');
  assert.equal(lines[1], '"Project, A",0.00,1500.00,0.00,90.00,400.00,1010.00,1010.00,0.00');
});
