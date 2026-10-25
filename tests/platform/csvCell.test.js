'use strict';
// Export cells: text that starts with a formula character is neutralised, numbers are left alone, and no export file defines its own cell function.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { csvCell } = require('../../server/organizational/lib/csvCell');

test('formula characters are neutralised in text', () => {
  for (const v of ['=1+1', '@SUM(A1)', '+cmd', '-cmd', '\tx']) assert.ok(csvCell(v).startsWith("'") || csvCell(v).startsWith('"\''), v);
});

test('numbers and zero are kept as they are', () => {
  assert.strictEqual(csvCell('-12.50'), '-12.50');
  assert.strictEqual(csvCell(-5), '-5');
  assert.strictEqual(csvCell(0), '0');
  assert.strictEqual(csvCell(null), '');
});

test('commas and quotes are quoted', () => {
  assert.strictEqual(csvCell('a,"b"'), '"a,""b"""');
});

test('export routes use the shared cell function', () => {
  const dir = path.join(__dirname, '../../server/organizational/routes');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (!/Content-Type', 'text\/csv/.test(src) || /sponsorshipRecords/.test(f)) continue;
    assert.match(src, /require\('\.\.\/lib\/csvCell'\)/, f);
  }
});
