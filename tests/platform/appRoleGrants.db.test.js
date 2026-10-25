'use strict';
// The app role keeps the grants in db/schema.sql: no delete on ledger lines, ledger transactions or the audit log, no update on the audit log.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };

test('the app role cannot delete ledger rows or change the audit log', opts, async () => {
  await h.withDb(async ({ pool, client, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    await asApp(ws.orgId);
    const denied = async (sql) => {
      await client.query('SAVEPOINT g');
      await assert.rejects(() => client.query(sql), /permission denied/, sql);
      await client.query('ROLLBACK TO SAVEPOINT g');
    };
    await denied('DELETE FROM org_ledger_lines');
    await denied('DELETE FROM org_ledger_transactions');
    await denied('DELETE FROM org_audit_log');
    await denied("UPDATE org_audit_log SET action = 'x'");
  });
});

test('every migration number is used once, except the pairs that already existed', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const known = new Set(['091', '172', '173', '290', '291']);
  const seen = new Map();
  for (const f of fs.readdirSync(path.join(__dirname, '../../db/migrations')).filter((x) => /^\d{3}_.*\.sql$/.test(x))) {
    const n = f.slice(0, 3);
    seen.set(n, (seen.get(n) || 0) + 1);
  }
  const dup = [...seen].filter(([n, c]) => c > 1 && !known.has(n)).map(([n]) => n);
  assert.deepEqual(dup, []);
});

test('db/schema.sql includes the newest migration', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const newest = fs.readdirSync(path.join(__dirname, '../../db/migrations')).filter((x) => /^\d{3}_.*\.sql$/.test(x)).sort().pop().slice(0, 3);
  const first = fs.readFileSync(path.join(__dirname, '../../db/schema.sql'), 'utf8').split('\n')[0];
  assert.equal(first, '-- Includes migrations through ' + newest, 'run scripts/dump-schema.sh after applying a migration');
});
