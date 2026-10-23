'use strict';
// Zero-row writes to protected tables must raise.

const test = require('node:test');
const assert = require('node:assert');
const { checkForSilentRlsFailure } = require('../../server/organizational/lib/scopedPool');

const pool = { query: async () => ({ rows: [{ relname: 'org_gifts' }] }) };

test('0-row write to a protected table raises', async () => {
  await assert.rejects(
    checkForSilentRlsFailure(pool, 'UPDATE org_gifts SET amount = 1 WHERE id = 5', { rowCount: 0 }),
    /org_gifts/
  );
});

test('writes that change rows, reads and unprotected tables pass', async () => {
  await checkForSilentRlsFailure(pool, 'UPDATE org_gifts SET amount = 1', { rowCount: 1 });
  await checkForSilentRlsFailure(pool, 'SELECT * FROM org_gifts', { rowCount: 0 });
  await checkForSilentRlsFailure(pool, 'DELETE FROM sessions WHERE id = 1', { rowCount: 0 });
});
