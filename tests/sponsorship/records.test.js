'use strict';

// Sponsorship S3 rules as plain functions: agreement merge fields, good standing, report status.

const test = require('node:test');
const assert = require('node:assert/strict');
const { renderTemplate, feeText } = require('../../server/organizational/lib/sponsorAgreements');
const { computeStanding } = require('../../server/organizational/lib/sponsorStanding');
const { reportStatus } = require('../../server/organizational/lib/sponsorReports');

test('agreement merge fields fill in, and an unknown or empty field becomes a blank to fill by hand', () => {
  const out = renderTemplate('Between {{sponsor_name}} and {{project_name}} from {{ effective_date }}; ends {{term_end}}; {{nope}}.',
    { sponsor_name: 'The workspace', project_name: 'Project A', effective_date: '2026-01-01', term_end: '' });
  assert.equal(out, 'Between The workspace and Project A from 2026-01-01; ends ____________; ____________.');
});

test('fee wording for the agreement', () => {
  assert.equal(feeText({ kind: 'percent', rate: '6.0000', minimum_quarter_cents: 25000 }), '6 percent of gross receipts, with a minimum of $250.00 each quarter');
  assert.equal(feeText({ kind: 'flat', flat_cents: 30000, minimum_quarter_cents: 0 }), '$300.00 each quarter');
  assert.match(feeText({ kind: 'tiered', tiers: [{ up_to_cents: 1000000, rate: 8 }, { up_to_cents: null, rate: 5 }] }), /8 percent .* up to \$10,000\.00, 5 percent of gross receipts above that/);
});

const good = {
  today: '2026-10-19', startDate: '2024-01-01', agreementSignedAt: '2024-01-05', lastReportReceivedAt: '2026-08-01',
  lastLobbyingAckOn: '2026-02-01', negative: false, unpostedFeePeriodEnds: ['2026-09-30'],
};

test('good standing: all conditions met (a quarter that ended recently may still wait for the fee run)', () => {
  const s = computeStanding(good);
  assert.equal(s.good, true);
});

for (const [name, change, key] of [
  ['no signed agreement', { agreementSignedAt: null }, 'agreement'],
  ['no report in the last year', { lastReportReceivedAt: '2025-06-01' }, 'annual_report'],
  ['a negative balance', { negative: true }, 'fees_current'],
  ['fees unposted long after the quarter ended', { unpostedFeePeriodEnds: ['2026-06-30'] }, 'fees_current'],
  ['lobbying acknowledgment older than a year', { lastLobbyingAckOn: '2025-09-01' }, 'lobbying_ack'],
]) {
  test('good standing fails for ' + name, () => {
    const s = computeStanding({ ...good, ...change });
    assert.equal(s.good, false);
    assert.equal(s.items.find((i) => i.key === key).ok, false);
  });
}

test('a project less than a year old does not need an annual report yet', () => {
  const s = computeStanding({ ...good, startDate: '2026-03-01', lastReportReceivedAt: null });
  assert.equal(s.items.find((i) => i.key === 'annual_report').ok, true);
});

test('report status', () => {
  assert.equal(reportStatus({ due_date: '2026-10-01' }, '2026-10-19'), 'overdue');
  assert.equal(reportStatus({ due_date: '2026-11-01' }, '2026-10-19'), 'due_soon');
  assert.equal(reportStatus({ due_date: '2027-02-01' }, '2026-10-19'), 'upcoming');
  assert.equal(reportStatus({ due_date: '2026-10-01', received_at: '2026-09-30' }, '2026-10-19'), 'received');
});
