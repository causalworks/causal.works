#!/usr/bin/env node
/**
 * Runtime RLS isolation test -- the companion to scripts/rls-coverage-audit.sql.
 *
 * The SQL audit answers "does a policy exist for this table/scope." This script answers the
 * question a schema audit structurally cannot: "does the policy actually behave correctly when
 * a real query runs through the real app role." Standard practice for testing Postgres RLS
 * (see pgTAP's own approach) is exactly this shape: build fixtures for at least two tenants,
 * connect as the SAME role and session mechanism the application actually uses (not a
 * superuser), and assert both the allowed and the forbidden outcome for reads AND writes.
 * "A query returning zero rows" is not proof of isolation on its own -- it could mean an empty
 * fixture, a forgotten GUC, or a superuser connection quietly bypassing RLS altogether; every
 * assertion below pairs a "should see this" case with a "should NOT see/write that" case so a
 * silently-broken policy (e.g. an empty database, or a connection that isn't actually
 * RLS-subject) can't produce an all-green run.
 *
 * Runs entirely inside one transaction that is ALWAYS rolled back at the end (success or
 * failure) -- it creates real fixture rows (two orgs, two programs, budget lines in each) but
 * never commits them, so this is safe to run against the live database with no cleanup step.
 *
 * Usage (from repo root, with .env DB_* set -- DB_USER must be causal_app, the RLS-subject
 * role, not postgres, or every assertion below would trivially pass for the wrong reason):
 *   node scripts/rls-coverage-test.js
 *
 * Exit code 0 = every assertion passed. Exit code 1 = at least one failed (see output for which).
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'causal_db',
});

let passed = 0;
let failed = 0;

function ok(label, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok   - ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL - ${label}${detail ? ` (${detail})` : ''}`);
  }
}

async function setScope(client, { orgId, programIds }) {
  await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgId)]);
  // '*' is the explicit sentinel for "no restriction" (migration 260). Do NOT try to "unset"
  // the GUC (set_config(..., NULL, ...) or RESET) to represent this -- a custom GUC that has
  // ever been set on a session decays to '' (empty string, meaning "sees nothing" here), never
  // back to a genuine NULL. This exact confusion is the bug migration 260 fixed; scopedPool.js
  // and this test must both always set an explicit value, never rely on "leave it alone".
  const value = programIds === null ? '*' : programIds.join(',');
  await client.query('SELECT set_config($1, $2, true)', ['app.current_program_ids', value]);
}

async function main() {
  if (process.env.DB_USER !== 'causal_app') {
    console.error(
      `Refusing to run: DB_USER is "${process.env.DB_USER}", not "causal_app". ` +
      `This test is meaningless unless it connects as the actual RLS-subject app role -- ` +
      `a superuser or table-owner connection bypasses every policy silently and every ` +
      `assertion below would pass for the wrong reason.`
    );
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // --- Fixture: two throwaway orgs, one program each, one budget line each. ---
    // Uses org_orgs' real columns via a minimal insert -- if this fails because required
    // columns changed, that's itself useful signal (schema drifted under this script).
    const orgA = (await client.query(
      `INSERT INTO coop_members (display_name, slug) VALUES ('RLS Test Org A', 'rls-test-org-a-' || floor(random()*1e9)) RETURNING id`
    )).rows[0].id;
    const orgB = (await client.query(
      `INSERT INTO coop_members (display_name, slug) VALUES ('RLS Test Org B', 'rls-test-org-b-' || floor(random()*1e9)) RETURNING id`
    )).rows[0].id;

    await setScope(client, { orgId: orgA, programIds: null });
    const progA1 = (await client.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'Program A1') RETURNING id`, [orgA])).rows[0].id;
    const progA2 = (await client.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'Program A2') RETURNING id`, [orgA])).rows[0].id;
    const acctA = (await client.query(
      `SELECT id FROM org_accounts WHERE org_id = $1 LIMIT 1`, [orgA]
    )).rows[0];
    // org_accounts likely doesn't exist yet for a brand-new fixture org -- create a minimal one.
    const accountA = acctA ? acctA.id : (await client.query(
      `INSERT INTO org_accounts (org_id, code, name, type) VALUES ($1, 'RLS-TEST', 'RLS Test Account', 'expense') RETURNING id`,
      [orgA]
    )).rows[0].id;

    await client.query(
      `INSERT INTO org_budget_lines (org_id, account_id, program_id, fiscal_year, month, amount_cents) VALUES ($1,$2,$3,2099,1,1000)`,
      [orgA, accountA, progA1]
    );
    await client.query(
      `INSERT INTO org_budget_lines (org_id, account_id, program_id, fiscal_year, month, amount_cents) VALUES ($1,$2,$3,2099,2,2000)`,
      [orgA, accountA, progA2]
    );

    // === Case 1: org isolation (migration 137) ===
    await setScope(client, { orgId: orgB, programIds: null });
    const orgBSeesOrgA = await client.query(`SELECT id FROM org_programs WHERE id IN ($1, $2)`, [progA1, progA2]);
    ok('org isolation: org B cannot see org A\'s programs', orgBSeesOrgA.rows.length === 0, `saw ${orgBSeesOrgA.rows.length} rows`);

    // === Case 2: no org context at all -- must fail closed (see nothing), not open ===
    // Setting to NULL here is deliberate and different from the "unrestricted" case above: it
    // decays to '' on both GUCs, and both org_isolation's NULLIF(..., '') and
    // current_program_ids()'s explicit '' branch already treat that as "see nothing" -- this
    // case exists specifically to confirm that decay fails closed, not open.
    await client.query(`SELECT set_config('app.current_org_id', NULL, true)`);
    await client.query(`SELECT set_config('app.current_program_ids', NULL, true)`);
    const noContextSees = await client.query(`SELECT id FROM org_programs WHERE id IN ($1, $2)`, [progA1, progA2]);
    ok('fail-closed: no org context set sees nothing', noContextSees.rows.length === 0, `saw ${noContextSees.rows.length} rows`);

    // === Case 3: admin/finance (org set, no program GUC) sees every program's lines ===
    await setScope(client, { orgId: orgA, programIds: null });
    const adminSees = await client.query(`SELECT program_id FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = 2099`, [orgA]);
    ok('unrestricted (admin/finance): sees both programs\' budget lines', adminSees.rows.length === 2, `saw ${adminSees.rows.length} rows`);

    // === Case 4: program-scoped read only sees its own program ===
    await setScope(client, { orgId: orgA, programIds: [progA1] });
    const scopedSees = await client.query(`SELECT program_id FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = 2099`, [orgA]);
    ok(
      'program-scoped read: sees ONLY its own program\'s line',
      scopedSees.rows.length === 1 && scopedSees.rows[0].program_id === progA1,
      `saw ${JSON.stringify(scopedSees.rows)}`
    );

    // === Case 5: program-scoped write to an in-scope program succeeds ===
    let inScopeWriteOk = true;
    try {
      await client.query(
        `INSERT INTO org_budget_lines (org_id, account_id, program_id, fiscal_year, month, amount_cents) VALUES ($1,$2,$3,2099,3,3000)`,
        [orgA, accountA, progA1]
      );
    } catch (e) {
      inScopeWriteOk = false;
    }
    ok('program-scoped write: an in-scope program_id is accepted', inScopeWriteOk);

    // === Case 6: program-scoped write to an OUT-of-scope program is rejected (the classic
    // USING-without-effective-WITH-CHECK bug -- verified NOT present here) ===
    // A rejected statement aborts the rest of the transaction at the Postgres level until a
    // rollback, so this expected failure is wrapped in its own SAVEPOINT -- without it, Case 7
    // below would never run, silently reporting fewer assertions than intended rather than
    // failing loudly (found live while first running this script).
    let outOfScopeWriteRejected = false;
    await client.query('SAVEPOINT before_rejected_write');
    try {
      await client.query(
        `INSERT INTO org_budget_lines (org_id, account_id, program_id, fiscal_year, month, amount_cents) VALUES ($1,$2,$3,2099,4,4000)`,
        [orgA, accountA, progA2]
      );
    } catch (e) {
      outOfScopeWriteRejected = /row-level security/i.test(e.message);
      await client.query('ROLLBACK TO SAVEPOINT before_rejected_write');
    }
    ok('program-scoped write: an out-of-scope program_id is REJECTED, not silently accepted', outOfScopeWriteRejected);

    // === Case 7: empty grant array (a program-role user with zero grants yet) sees nothing,
    // not everything -- the "fail closed on an empty array" case programScope.js documents ===
    await setScope(client, { orgId: orgA, programIds: [] });
    const emptyScopeSees = await client.query(`SELECT program_id FROM org_budget_lines WHERE org_id = $1 AND fiscal_year = 2099`, [orgA]);
    ok('empty program grant: sees nothing (real empty state, not treated as unrestricted)', emptyScopeSees.rows.length === 0, `saw ${emptyScopeSees.rows.length} rows`);

    await client.query('ROLLBACK');
    console.log(`\nRolled back all fixture data (org_id ${orgA}, ${orgB} never committed).`);
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Test script itself errored (not a policy assertion failure):', e.message);
    failed += 1;
  } finally {
    client.release();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

main();
