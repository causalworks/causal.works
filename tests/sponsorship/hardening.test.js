'use strict';

// Public-form hardening as plain functions: spreadsheet-safe CSV cells, public-host check, the form secret, IP hashing.

process.env.PUBLIC_FORM_SECRET = process.env.PUBLIC_FORM_SECRET || 'test-form-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell } = require('../../server/organizational/lib/csvCell');
const { publicHttpsProblem, privateAddress } = require('../../server/organizational/lib/publicHost');
const links = require('../../server/organizational/lib/publicLinks');
const { informationReturnCsv } = require('../../server/organizational/lib/sponsorGrants');

test('csv cells: formula starts are neutralised, quotes and commas still escaped', () => {
  assert.equal(csvCell('=HYPERLINK("http://x.test")'), '"\'=HYPERLINK(""http://x.test"")"');
  assert.equal(csvCell('+1'), "'+1");
  assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(csvCell('Plain, text'), '"Plain, text"');
  assert.equal(csvCell(null), '');
  const csv = informationReturnCsv({ rows: [{ entity_name: '=cmd()', projects: ['A'], cash_cents: 100, property_cents: 0, total_cents: 100, releases: 1, needs_information_return: false }] });
  assert.match(csv, /^Receiving entity[^\n]*\n'=cmd\(\),A,1\.00,0\.00,1\.00,1,no\n$/);
});

test('public host check: https only, no internal or private addresses', async () => {
  const lookup = (map) => async (h) => (map[h] || []).map((address) => ({ address }));
  assert.equal(await publicHttpsProblem('https://verify.example.test/check', lookup({ 'verify.example.test': ['93.184.216.34'] })), null);
  assert.ok(await publicHttpsProblem('http://verify.example.test/check', lookup({ 'verify.example.test': ['93.184.216.34'] })));
  assert.ok(await publicHttpsProblem('https://internal.example.test/', lookup({ 'internal.example.test': ['10.0.0.5'] })));
  assert.ok(await publicHttpsProblem('https://rebind.example.test/', lookup({ 'rebind.example.test': ['93.184.216.34', '127.0.0.1'] })));
  assert.ok(await publicHttpsProblem('https://169.254.169.254/latest'));
  assert.ok(await publicHttpsProblem('https://localhost/'));
  assert.ok(await publicHttpsProblem('https://user:pw@verify.example.test/', lookup({ 'verify.example.test': ['93.184.216.34'] })));
  assert.ok(privateAddress('::1') && privateAddress('fd00::1') && privateAddress('::ffff:192.168.1.1') && !privateAddress('2606:4700::1111'));
});

test('the form secret must be set and changes the tokens it signs', () => {
  const had = { a: process.env.PUBLIC_FORM_SECRET, b: process.env.SESSION_SECRET };
  try {
    assert.equal(links.formSecret(), had.a);
    delete process.env.PUBLIC_FORM_SECRET; delete process.env.SESSION_SECRET;
    assert.throws(() => links.issueFormToken(1), /PUBLIC_FORM_SECRET/);
    process.env.PUBLIC_FORM_SECRET = 'one';
    const a = links.issueFormToken(1, 1000);
    process.env.PUBLIC_FORM_SECRET = 'two';
    assert.notEqual(a, links.issueFormToken(1, 1000));
  } finally {
    if (had.a === undefined) delete process.env.PUBLIC_FORM_SECRET; else process.env.PUBLIC_FORM_SECRET = had.a;
    if (had.b !== undefined) process.env.SESSION_SECRET = had.b;
  }
});
