'use strict';
// Net assets by restriction and the release amount: statistical accounts are excluded and the statements and cash split agree. Needs SMOKE_DATABASE_URL (see freshWorkspace.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');
const { netAssetsByClass, netAssetBuckets, releasedFromRestrictions } = require('../../server/organizational/lib/restrictedNetAssets');
const { cashByRestriction } = require('../../server/organizational/lib/cashByRestriction');

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
    const acct = async (code, type, cash, stat = false) => (await scoped.query(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account, is_statistical)
       VALUES ($1, $2, $2, $3::org_account_type, true, 3, $4, $5) RETURNING id`, [org.id, code, type, cash, stat])).rows[0].id;
    return { orgId: org.id, userId: user.id, program, bank: await acct('1000', 'asset', true), income: await acct('4000', 'income', false), expense: await acct('6000', 'expense', false), stat: await acct('9000', 'income', false, true) };
  });
}

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pool = new pg.Pool({ connectionString: URL, max: 4 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('restricted net assets, release and cash split agree and ignore statistical accounts', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await inOrg(w.orgId, async () => {
    const R = 'temporarily_restricted';
    const base = { orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-01', memo: 'Test', source: 'manual', internalApproval: null };
    const line = (account_id, side, cents, rc) => ({ account_id, program_id: w.program, [side]: cents, ...(rc ? { donor_restriction_class: rc } : {}) });
    for (const lines of [
      [line(w.bank, 'debit_cents', 10000), line(w.income, 'credit_cents', 10000, R)],
      [line(w.expense, 'debit_cents', 4000, R), line(w.bank, 'credit_cents', 4000)],
      [line(w.bank, 'debit_cents', 500), line(w.stat, 'credit_cents', 500, R)],
    ]) {
      const r = await postLedgerTransaction(scoped, { ...base, lines });
      assert.ok(!r.httpStatus || r.httpStatus < 400, JSON.stringify(r.body));
    }
    const byClass = await netAssetsByClass(scoped, w.orgId, { throughFiscalYear: 2026 });
    assert.strictEqual(byClass.temporarily_restricted, 6000);
    assert.deepStrictEqual(netAssetBuckets(byClass), { without_restrictions: 0, with_restrictions: 6000 });
    assert.strictEqual(await releasedFromRestrictions(scoped, w.orgId, 2026), 4000);
    assert.strictEqual((await cashByRestriction(scoped, w.orgId)).temporarily_restricted_cents, '6000');
  });
});
