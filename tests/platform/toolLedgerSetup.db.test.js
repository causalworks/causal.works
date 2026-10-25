'use strict';
// Conversion balance and board designation tools under simultaneous requests. Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { runTool } = require('../../server/organizational/tools');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(w, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(w.userId); fn().then(resolve, reject); });
  });
}
const run = (w, name, input) => inOrg(w, () => runTool(name, { pool: scoped, orgId: w.orgId, userId: w.userId, actor: 'human', programScope: null, meta: {} }, input));

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Setup ${stamp}`, `setup-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`setup-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    const q = (sql, p) => scoped.query(sql, p);
    await q('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await q(`INSERT INTO org_programs (org_id, name, is_default) VALUES ($1, 'General', true) RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await q(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.bank = await acct('1000', 'asset');
    await q('UPDATE org_accounts SET is_cash_account = true WHERE id = $1', [w.bank]);
    w.income = await acct('4000', 'income');
    w.equityFrom = await acct('3000', 'equity');
    w.equityTo = await acct('3100', 'equity');
    w.designation = (await q(`INSERT INTO org_board_designations (org_id, name) VALUES ($1, 'Reserve') RETURNING id`, [w.orgId])).rows[0].id;
  });
  return w;
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 10 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous conversion balance saves leave one active entry', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const input = { conversion_date: '2026-01-01', program_id: w.program, balancing_account_id: w.equityFrom, lines: [{ account_id: w.bank, debit_cents: 50000 }] };
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'conversion_balances.save', input)));
  assert.ok(results.every((r) => r.httpStatus === 200), JSON.stringify(results.map((r) => r.httpStatus)));
  const n = (await inOrg(w, () => scoped.query(`SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = 'conversion_balance' AND status = 'posted'`, [w.orgId]))).rows[0].n;
  assert.equal(n, 1);
});

test('five simultaneous designations of all available net assets post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const seeded = await inOrg(w, () => postLedgerTransaction(scoped, {
    orgId: w.orgId, userId: w.userId, transactionDate: '2026-02-01', memo: 'Seed', source: 'manual',
    lines: [{ account_id: w.bank, program_id: w.program, debit_cents: 10000, credit_cents: 0 }, { account_id: w.income, program_id: w.program, debit_cents: 0, credit_cents: 10000 }],
  }));
  assert.equal(seeded.httpStatus, 201, JSON.stringify(seeded.body));
  const input = { id: w.designation, direction: 'designate', amount_cents: 10000, undesignated_account_id: w.equityFrom, designated_account_id: w.equityTo, transaction_date: '2026-03-01' };
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'board_designation.transfer', input)));
  assert.equal(results.filter((r) => r.httpStatus < 300).length, 1, JSON.stringify(results.map((r) => r.httpStatus)));
});
