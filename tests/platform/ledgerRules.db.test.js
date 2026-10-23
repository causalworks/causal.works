'use strict';
// Ledger rules through the restricted app role: balance, other-workspace references, year locks, federal approval,
// restriction defaults and workspace isolation. Needs SMOKE_DATABASE_URL (see freshWorkspace.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(orgId, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(orgId); fn().then(resolve, reject); });
  });
}

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(
    `INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Rules ${stamp}`, `rules-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`rules-${stamp}@example.test`])).rows[0];
  return inOrg(org.id, async () => {
    await scoped.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [org.id]);
    const program = (await scoped.query(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [org.id])).rows[0].id;
    const acct = async (code, type, cash) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account)
       VALUES ($1, $2, $2, $3::org_account_type, true, 3, $4) RETURNING id`, [org.id, code, type, cash])).rows[0].id;
    return { orgId: org.id, userId: user.id, program, bank: await acct('1000', 'asset', true), income: await acct('4000', 'income', false) };
  });
}

const gift = (w, extra) => ({
  orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Test', source: 'manual', internalApproval: null,
  lines: [
    { account_id: w.bank, program_id: w.program, debit_cents: 1000, ...(extra || {}) },
    { account_id: w.income, program_id: w.program, credit_cents: 1000, ...(extra || {}) },
  ],
});

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pool = new pg.Pool({ connectionString: URL, max: 4 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('an unbalanced entry is refused', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const opts = gift(w);
    opts.lines[1].credit_cents = 900;
    const r = await postLedgerTransaction(scoped, opts);
    assert.equal(r.httpStatus, 422);
    assert.equal(r.body.code, 'unbalanced');
  });
});

test('a line that uses another workspace\'s account is refused', { skip: SKIP }, async () => {
  const a = await makeWorkspace();
  const b = await makeWorkspace();
  await inOrg(a.orgId, async () => {
    const opts = gift(a);
    opts.lines[0].account_id = b.bank;
    const r = await postLedgerTransaction(scoped, opts);
    assert.equal(r.httpStatus, 422);
    assert.equal(r.body.code, 'cross_org_reference');
  });
});

test('a locked fiscal year refuses new entries and reopening allows them', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    await scoped.query('INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at, locked_by_user_id) VALUES ($1, 2026, now(), $2)', [w.orgId, w.userId]);
    const refused = await postLedgerTransaction(scoped, gift(w));
    assert.equal(refused.httpStatus, 409);
    assert.equal(refused.body.code, 'fiscal_year_locked');
    await scoped.query('UPDATE org_fiscal_year_locks SET locked_at = NULL, reopened_at = now(), reopened_by_user_id = $2, reopen_reason = $3 WHERE org_id = $1', [w.orgId, w.userId, 'test']);
    const allowed = await postLedgerTransaction(scoped, gift(w));
    assert.equal(allowed.httpStatus, 201);
  });
});

test('an entry on a federal award waits for approval; others post at once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const federal = (await scoped.query('INSERT INTO org_grants (org_id, is_federal_award) VALUES ($1, true) RETURNING id', [w.orgId])).rows[0].id;
    const waits = await postLedgerTransaction(scoped, gift(w, { grant_id: federal }));
    assert.equal(waits.httpStatus, 201);
    assert.equal(waits.body.status, 'pending_approval');
    const plain = await postLedgerTransaction(scoped, gift(w));
    assert.equal(plain.body.status, 'posted');
  });
});

test('a line on a grant takes the grant\'s restriction unless one is given', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const grant = (await scoped.query(`INSERT INTO org_grants (org_id, donor_restriction_class) VALUES ($1, 'temporarily_restricted') RETURNING id`, [w.orgId])).rows[0].id;
    const inherited = await postLedgerTransaction(scoped, gift(w, { grant_id: grant }));
    const given = await postLedgerTransaction(scoped, gift(w, { grant_id: grant, donor_restriction_class: 'unrestricted' }));
    const classes = async (id) => (await scoped.query('SELECT DISTINCT donor_restriction_class::text AS c FROM org_ledger_lines WHERE transaction_id = $1', [id])).rows.map((r) => r.c);
    assert.deepEqual(await classes(inherited.body.id), ['temporarily_restricted']);
    assert.deepEqual(await classes(given.body.id), ['unrestricted']);
  });
});

test('one workspace cannot read or write another\'s ledger', { skip: SKIP }, async () => {
  const a = await makeWorkspace();
  const b = await makeWorkspace();
  const posted = await inOrg(a.orgId, () => postLedgerTransaction(scoped, gift(a)));
  assert.equal(posted.httpStatus, 201);
  await inOrg(b.orgId, async () => {
    const seen = await scoped.query('SELECT count(*)::int AS n FROM org_ledger_transactions WHERE id = $1', [posted.body.id]);
    assert.equal(seen.rows[0].n, 0);
    await assert.rejects(scoped.query(
      `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source) VALUES ($1, '2026-03-01', 2026, 'x', 'manual')`, [a.orgId]));
  });
});
