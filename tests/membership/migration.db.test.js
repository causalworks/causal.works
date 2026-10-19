'use strict';

// Migration 344 on a fresh copy of the schema: org_members rows move to contacts (matched by email), the
// dues member role, terms and payments; reminders move to the message log; the old tables are dropped.
// Needs TEST_DATABASE_URL and TEST_SCHEMA_SQL (the path to build-specs/schema.sql).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.TEST_DATABASE_URL || '';
const SCHEMA = process.env.TEST_SCHEMA_SQL || '';
const skip = DB_URL && SCHEMA && fs.existsSync(SCHEMA) ? false : 'Set TEST_DATABASE_URL and TEST_SCHEMA_SQL to run the migration copy test.';

function sqlFile(file) {
  return fs.readFileSync(file, 'utf8').split('\n').filter((l) => !l.startsWith('\\')).join('\n');
}

test('migration 344 copies org_members to contacts and terms, then drops the old tables', { skip }, async () => {
  const { Client } = require('pg');
  require('pg').types.setTypeParser(1082, (v) => v);
  const name = 'memb_migration_' + process.pid;
  const admin = new Client({ connectionString: DB_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  const url = new URL(DB_URL);
  url.pathname = '/' + name;
  const db = new Client({ connectionString: url.toString() });
  try {
    await db.connect();
    await db.query(sqlFile(SCHEMA));
    await db.query('SET search_path TO public');
    await db.query(`
      INSERT INTO coop_members (id, display_name, slug) VALUES (9001, 'Workspace', 'ws-mig');
      INSERT INTO org_membership_tiers (id, org_id, name, dues_amount_cents) VALUES (501, 9001, 'Standard', 5000), (502, 9001, 'Free', 0);
      INSERT INTO org_constituents (id, org_id, display_name, email, kind) VALUES (7001, 9001, 'Existing contact', 'One@Example.test', 'individual');
      INSERT INTO org_members (id, org_id, tier_id, first_name, last_name, email, phone, current_period_start, current_period_end, status, notes, joined_at)
      VALUES (1, 9001, 501, 'Dues', 'One', 'one@example.test', '555-0101', '2026-01-01', '2026-12-31', 'active', 'carried note', '2025-06-01'),
             (2, 9001, 502, 'Dues', 'Two', 'two@example.test', NULL, '2025-01-01', '2025-12-31', 'terminated', NULL, '2025-01-01');
      INSERT INTO org_membership_payments (member_id, amount_cents, payment_date, period_covered_start, period_covered_end, payment_method)
      VALUES (1, 5000, '2026-01-05', '2026-01-01', '2026-12-31', 'Check'), (1, 100, '2026-01-06', '2026-01-01', '2026-12-31', 'barter');
      INSERT INTO org_membership_reminders (member_id, reminder_type, delivered) VALUES (1, 'upcoming_renewal', true);`);
    await db.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'causal_app') THEN CREATE ROLE causal_app; END IF; END $$`);
    await db.query(sqlFile(path.join(__dirname, '..', '..', 'db', 'migrations', '344_membership_core.sql')));

    const contacts = (await db.query(`SELECT id, display_name, email, phone, notes FROM org_constituents ORDER BY display_name`)).rows;
    assert.equal(contacts.length, 2);
    assert.deepEqual(contacts.find((c) => c.id === 7001), { id: 7001, display_name: 'Existing contact', email: 'One@Example.test', phone: '555-0101', notes: 'carried note' });
    const two = contacts.find((c) => c.id !== 7001);
    assert.equal(two.email, 'two@example.test');
    const roles = (await db.query(`SELECT constituent_id, role FROM org_contact_roles ORDER BY constituent_id`)).rows;
    assert.deepEqual(roles.map((r) => r.role), ['dues_member', 'dues_member']);
    const terms = (await db.query(`SELECT constituent_id, tier_id, starts_on, ends_on, price_cents, source, status_override FROM org_membership_terms ORDER BY id`)).rows;
    assert.deepEqual(terms, [
      { constituent_id: 7001, tier_id: 501, starts_on: '2026-01-01', ends_on: '2026-12-31', price_cents: 5000, source: 'import', status_override: null },
      { constituent_id: two.id, tier_id: 502, starts_on: '2025-01-01', ends_on: '2025-12-31', price_cents: 0, source: 'import', status_override: 'ended' },
    ]);
    const pays = (await db.query(`SELECT constituent_id, kind, method, amount_cents, notes FROM org_membership_payments ORDER BY id`)).rows;
    assert.deepEqual(pays, [
      { constituent_id: 7001, kind: 'payment', method: 'check', amount_cents: 5000, notes: null },
      { constituent_id: 7001, kind: 'payment', method: 'other', amount_cents: 100, notes: 'Method: barter' },
    ]);
    const msgs = (await db.query(`SELECT template_key, status FROM org_membership_messages`)).rows;
    assert.deepEqual(msgs, [{ template_key: 'upcoming_renewal', status: 'sent' }]);
    const prices = (await db.query(`SELECT tier_id, price_cents FROM org_membership_tier_prices ORDER BY tier_id`)).rows;
    assert.deepEqual(prices, [{ tier_id: 501, price_cents: 5000 }, { tier_id: 502, price_cents: 0 }]);
    const gone = (await db.query(`SELECT to_regclass('org_members') AS a, to_regclass('org_membership_reminders') AS b`)).rows[0];
    assert.deepEqual(gone, { a: null, b: null });
    const perm = (await db.query(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'org_access_permissions_permission_check'`)).rows[0].d;
    assert.match(perm, /manage_membership/);
    const rls = (await db.query(`SELECT relname FROM pg_class WHERE relname LIKE 'org_membership%' AND relkind = 'r' AND NOT (relrowsecurity AND relforcerowsecurity)`)).rows;
    assert.deepEqual(rls, []);
  } finally {
    await db.end().catch(() => {});
    await admin.query(`DROP DATABASE IF EXISTS ${name}`).catch(() => {});
    await admin.end();
  }
});
