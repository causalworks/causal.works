'use strict';
// Statement tree: totals come from the lines, and a failed check stops the statement.

const test = require('node:test');
const assert = require('node:assert');
const { line, group, amountOf, buildStatement, StatementIntegrityError } = require('../../server/organizational/lib/statementTree');

test('a group total is the sum of its lines and rows foot', () => {
  const g = group('Assets', [line('Cash', 1000), line('Receivable', 250)], { total: 'Total assets', totalKind: 'total' });
  const { rows } = buildStatement([g], []);
  assert.strictEqual(amountOf(g), 1250);
  assert.strictEqual(rows.find((r) => r.kind === 'total').amount_cents, 1250);
});

test('nested groups carry their subtotal into the parent total', () => {
  const inner = group('Without restrictions', [line('Designated', 400), line('Undesignated', 600)], { total: 'Subtotal' });
  const outer = group('Net assets', [inner, line('With restrictions', 500)], { total: 'Total net assets', totalKind: 'total' });
  const { rows } = buildStatement([outer], []);
  assert.strictEqual(rows.find((r) => r.label === 'Subtotal').amount_cents, 1000);
  assert.strictEqual(rows.find((r) => r.label === 'Total net assets').amount_cents, 1500);
});

test('a failed blocking check throws and lists the difference', () => {
  const g = group('Assets', [line('Cash', 1000)], { total: 'Total assets', totalKind: 'total' });
  assert.throws(() => buildStatement([g], [{ name: 'Assets equal liabilities plus net assets', left: 1000, right: 900 }]), (e) => {
    assert.ok(e instanceof StatementIntegrityError);
    assert.match(e.failures[0].message, /difference 100/);
    return true;
  });
});

test('a warning check does not stop the statement and is returned', () => {
  const g = group('Assets', [line('Cash', 1000)], { total: 'Total assets', totalKind: 'total' });
  const { warnings } = buildStatement([g], [{ name: 'Designations exceed net assets', severity: 'warn', left: 5, right: 0 }]);
  assert.strictEqual(warnings.length, 1);
});
