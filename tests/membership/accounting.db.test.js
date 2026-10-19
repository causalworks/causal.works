'use strict';

// Dues postings against a throwaway database: posting a payment and a refund (debits equal credits, deferred in spread
// mode), reversal with a reason, the recognition run for a term across two fiscal years, a locked year refusing, the
// Banking match path, and who may see and post.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };
const B = '/api/organizational/orgs/:slug/membership';
const D = '/api/organizational/orgs/:slug/dues-postings';

async function setup(pool, asApp, asOwner, settings) {
  const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Arts Collective', 'acct-memb-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month, membership_enabled) VALUES ($1, 12, true)', [org.id]);
  const users = {};
  for (const role of ['admin', 'finance', 'fundraising', 'board']) {
    const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [org.id, u.id, role]);
    users[role] = u.id;
  }
  const acct = async (code, name, type, cash) => (await h.one(pool,
    `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account) VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`,
    [org.id, code, name, type, !!cash])).id;
  const accounts = {
    bank: await acct('1000', 'Operating bank', 'asset', true),
    deferred: await acct('2400', 'Dues received in advance', 'liability'),
    dues: await acct('4100', 'Membership dues', 'income'),
    contrib: await acct('4000', 'Contributions', 'income'),
  };
  const program = (await h.one(pool, `INSERT INTO org_programs (org_id, name) VALUES ($1, 'Membership') RETURNING id`, [org.id])).id;
  await pool.query('UPDATE org_settings SET default_bank_account_id = $1 WHERE org_id = $2', [accounts.bank, org.id]);
  await asApp(org.id);
  const staff = h.loadRoutes('routes/membership.js', 'registerMembershipRoutes', pool);
  const acc = h.loadRoutes('routes/duesPostings.js', 'registerDuesPostingRoutes', pool);
  const as = (role, extra) => ({ user: users[role], role, orgId: org.id, ...(extra || {}), params: { slug: org.slug, ...((extra && extra.params) || {}) } });
  const call = async (routes, base, method, path, role, extra, expect) => {
    const res = await routes.call(method, base + path, as(role, extra));
    if (expect) assert.equal(res.statusCode, expect, method + ' ' + path + ' ' + JSON.stringify(res.body));
    return res;
  };
  const m = (method, path, role, extra, expect) => call(staff, B, method, path, role, extra, expect);
  const d = (method, path, role, extra, expect) => call(acc, D, method, path, role, extra, expect);
  await m('PUT', '/settings', 'admin', { body: { deferred_dues_account_id: accounts.deferred, contribution_account_id: accounts.contrib, dues_revenue_account_id: accounts.dues, default_program_id: program, ...(settings || {}) } }, 200);
  const tier = (await m('POST', '/tiers', 'finance', { body: { name: 'Standard', price: '365', effective_on: '2020-01-01' } }, 201)).body.tier;
  const pwyc = (await m('POST', '/tiers', 'finance', { body: { name: 'Choose', price: '0', pay_what_you_can: true, min_price: '100', benefit_value: '300', effective_on: '2020-01-01' } }, 201)).body.tier;
  const join = async (t, startsOn, body) => (await m('POST', '/dues-members', 'fundraising', { body: { tier_id: t.id, starts_on: startsOn, contact: { display_name: 'Holder ' + Math.floor(Math.random() * 1e6) }, ...(body || {}) } }, 201)).body;
  const pay = async (termId, amount, date) => (await m('POST', '/terms/:id/payments', 'finance', { params: { id: String(termId) }, body: { amount, payment_date: date } }, 201)).body.payment_id;
  const lines = async (txnId) => (await pool.query('SELECT account_id, debit_cents, credit_cents FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id', [txnId])).rows.map((r) => ({ account_id: r.account_id, debit: Number(r.debit_cents), credit: Number(r.credit_cents) }));
  return { org, users, accounts, program, tier, pwyc, m, d, join, pay, lines, asOwner, asApp };
}

const balanced = (ls) => ls.reduce((a, l) => a + l.debit, 0) === ls.reduce((a, l) => a + l.credit, 0);

test('a dues payment waits unposted; Accounting posts it with debits equal to credits, the exchange part deferred', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const j = await s.join(s.pwyc, '2026-07-01', { price: '500' });
    const pid = await s.pay(j.term_id, '500', '2026-07-03');
    const q = await s.d('GET', '', 'finance', { query: { month: '2026-07' } }, 200);
    assert.deepEqual(q.body.pending.map((x) => [x.id, x.kind, x.amount_cents]), [[pid, 'payment', 50000]]);
    assert.equal(q.body.default_deposit_account_id, s.accounts.bank);
    const posted = await s.d('POST', '/:id/post', 'finance', { params: { id: String(pid) }, body: { posting_date: '2026-07-03', deposit_account_id: s.accounts.bank } }, 200);
    assert.deepEqual(posted.body.split, { contribution: 20000, deferred: 30000, revenue: 0 });
    const ls = await s.lines(posted.body.ledger_transaction_id);
    assert.ok(balanced(ls));
    assert.deepEqual(ls.map((l) => [l.account_id, l.debit, l.credit]), [[s.accounts.bank, 50000, 0], [s.accounts.contrib, 0, 20000], [s.accounts.deferred, 0, 30000]]);
    const txn = await h.one(pool, 'SELECT source, constituent_id FROM org_ledger_transactions WHERE id = $1', [posted.body.ledger_transaction_id]);
    assert.deepEqual([txn.source, txn.constituent_id], ['membership_dues', j.constituent_id]);
    assert.equal((await s.d('POST', '/:id/post', 'finance', { params: { id: String(pid) }, body: { posting_date: '2026-07-03', deposit_account_id: s.accounts.bank } })).statusCode, 409);
  });
});

test('a refund posts the mirror entry; reversing a posting needs a reason and puts the payment back in the queue', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const j = await s.join(s.pwyc, '2026-07-01', { price: '500' });
    const pid = await s.pay(j.term_id, '500', '2026-07-03');
    await s.d('POST', '/:id/post', 'finance', { params: { id: String(pid) }, body: { posting_date: '2026-07-03', deposit_account_id: s.accounts.bank } }, 200);
    const rf = await s.m('POST', '/payments/:id/refund', 'finance', { params: { id: String(pid) }, body: { amount: '100', reason: 'Changed level', payment_date: '2026-07-10' } }, 201);
    const post = await s.d('POST', '/:id/post', 'finance', { params: { id: String(rf.body.payment_id) }, body: { posting_date: '2026-07-10', deposit_account_id: s.accounts.bank } }, 200);
    const ls = await s.lines(post.body.ledger_transaction_id);
    assert.ok(balanced(ls));
    assert.deepEqual(ls.map((l) => [l.account_id, l.debit, l.credit]), [[s.accounts.bank, 0, 10000], [s.accounts.contrib, 4000, 0], [s.accounts.deferred, 6000, 0]]);
    assert.equal((await s.d('POST', '/:id/reverse', 'finance', { params: { id: String(pid) }, body: {} })).statusCode, 400);
    const rev = await s.d('POST', '/:id/reverse', 'finance', { params: { id: String(pid) }, body: { reason: 'Posted to the wrong account' } }, 200);
    const rls = await s.lines(rev.body.reversal_transaction_id);
    assert.deepEqual(rls.map((l) => [l.account_id, l.debit, l.credit]), [[s.accounts.bank, 0, 50000], [s.accounts.contrib, 20000, 0], [s.accounts.deferred, 30000, 0]]);
    const q = await s.d('GET', '', 'finance', {}, 200);
    assert.ok(q.body.pending.some((x) => x.id === pid));
    const log = await h.one(pool, `SELECT metadata->>'reason' AS reason FROM org_audit_log WHERE table_name = 'org_membership_payments' AND record_id = $1 AND field_name = 'posting_status' AND new_value = 'unposted'`, [pid]);
    assert.equal(log.reason, 'Posted to the wrong account');
  });
});

test('recognition: preview then confirm per month; a term across two fiscal years splits by days; a rerun adds nothing', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const j = await s.join(s.tier, '2025-07-01');
    const pid = await s.pay(j.term_id, '365', '2025-06-20');
    await s.d('POST', '/:id/post', 'finance', { params: { id: String(pid) }, body: { posting_date: '2025-06-20', deposit_account_id: s.accounts.bank } }, 200);
    const june = await s.d('GET', '', 'finance', { query: { month: '2025-06' } }, 200);
    assert.deepEqual(june.body.recognition.rows, []);
    for (let mth = 7; mth <= 18; mth++) {
      const y = 2025 + Math.floor((mth - 1) / 12);
      const month = y + '-' + String(((mth - 1) % 12) + 1).padStart(2, '0');
      const pv = await s.d('GET', '', 'finance', { query: { month } }, 200);
      assert.equal(pv.body.recognition.rows.length, 1, month);
      await s.d('POST', '/recognition', 'finance', { body: { month } }, 200);
      assert.equal((await s.d('POST', '/recognition', 'finance', { body: { month } })).statusCode, 409);
    }
    const byYear = await pool.query(
      `SELECT t.fiscal_year, SUM(l.credit_cents - l.debit_cents)::int AS revenue FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id
        WHERE t.org_id = $1 AND l.account_id = $2 GROUP BY t.fiscal_year ORDER BY 1`, [s.org.id, s.accounts.dues]);
    assert.deepEqual(byYear.rows, [{ fiscal_year: 2025, revenue: 18400 }, { fiscal_year: 2026, revenue: 18100 }]);
    const deferred = await h.one(pool, `SELECT SUM(l.credit_cents - l.debit_cents)::int AS bal FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id WHERE t.org_id = $1 AND l.account_id = $2`, [s.org.id, s.accounts.deferred]);
    assert.equal(deferred.bal, 0);
    const txns = await pool.query(`SELECT id FROM org_ledger_transactions WHERE org_id = $1`, [s.org.id]);
    for (const t of txns.rows) assert.ok(balanced(await s.lines(t.id)));
    assert.equal((await s.d('POST', '/recognition/reverse', 'finance', { body: { month: '2026-05', reason: 'Wrong' } })).statusCode, 409);
    await s.d('POST', '/recognition/reverse', 'finance', { body: { month: '2026-06', reason: 'Check the run again' } }, 200);
    const again = await s.d('GET', '', 'finance', { query: { month: '2026-06' } }, 200);
    assert.equal(again.body.recognition.rows[0].amount_cents, 36500 - 33500);
  });
});

test('at-receipt mode posts straight to revenue once the term has started; a locked fiscal year refuses posting and recognition', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner, { recognition_mode: 'at_receipt' });
    const j = await s.join(s.tier, '2025-03-01');
    const pid = await s.pay(j.term_id, '365', '2025-03-05');
    const ok = await s.d('POST', '/:id/post', 'finance', { params: { id: String(pid) }, body: { posting_date: '2025-03-05', deposit_account_id: s.accounts.bank } }, 200);
    assert.deepEqual(ok.body.split, { contribution: 0, deferred: 0, revenue: 36500 });
    const k = await s.join(s.tier, '2025-09-01');
    const early = await s.pay(k.term_id, '300', '2025-08-20');
    const pre = await s.d('POST', '/:id/post', 'finance', { params: { id: String(early) }, body: { posting_date: '2025-08-20', deposit_account_id: s.accounts.bank } }, 200);
    assert.deepEqual(pre.body.split, { contribution: 0, deferred: 30000, revenue: 0 });
    const late = await s.pay(k.term_id, '65', '2025-10-01');
    await s.asOwner();
    await pool.query(`INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at) VALUES ($1, 2025, now())`, [s.org.id]);
    await s.asApp(s.org.id);
    const locked = await s.d('POST', '/:id/post', 'finance', { params: { id: String(late) }, body: { posting_date: '2025-10-01', deposit_account_id: s.accounts.bank } });
    assert.equal(locked.statusCode, 409, JSON.stringify(locked.body));
    assert.equal(locked.body.code, 'fiscal_year_locked');
    const lockedRun = await s.d('POST', '/recognition', 'finance', { body: { month: '2025-09' } });
    assert.equal(lockedRun.statusCode, 409, JSON.stringify(lockedRun.body));
    assert.equal(lockedRun.body.code, 'fiscal_year_locked');
    assert.equal((await pool.query('SELECT count(*)::int AS n FROM org_membership_recognition WHERE term_id = $1', [k.term_id])).rows[0].n, 0);
    await s.d('POST', '/:id/post', 'finance', { params: { id: String(late) }, body: { posting_date: '2026-01-05', deposit_account_id: s.accounts.bank } }, 200);
  });
});

test('a bank-line match in Banking posts through the same split; only Accounting writers post and only Accounting readers see the tab', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const s = await setup(pool, asApp, asOwner);
    const j = await s.join(s.tier, '2026-07-01');
    const pid = await s.pay(j.term_id, '365', '2026-07-02');
    const { recordMembershipDuesPayment } = require('../../server/organizational/lib/membershipDuesPayment');
    const out = await recordMembershipDuesPayment(pool, { orgId: s.org.id, userId: s.users.finance, paymentId: pid, bankAccountId: s.accounts.bank, paymentDate: '2026-07-02' });
    assert.equal(out.httpStatus, 200, JSON.stringify(out.body));
    const ls = await s.lines(out.body.ledger_transaction_id);
    assert.deepEqual(ls.map((l) => [l.account_id, l.debit, l.credit]), [[s.accounts.bank, 36500, 0], [s.accounts.deferred, 0, 36500]]);
    const other = await s.pay(j.term_id, '1', '2026-07-03');
    const fr = await s.d('POST', '/:id/post', 'fundraising', { params: { id: String(other) }, body: { posting_date: '2026-07-03', deposit_account_id: s.accounts.bank } });
    assert.equal(fr.statusCode, 403);
    assert.equal((await s.d('GET', '', 'board')).statusCode, 403);
    assert.equal((await s.d('GET', '', 'fundraising')).body.code, 'no_access');
  });
});
