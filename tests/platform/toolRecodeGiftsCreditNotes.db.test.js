'use strict';
// Recode, gift posting, credit note, bill approval, invoice send and write-off tools under simultaneous requests. Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

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
const run = (w, name, input, actor = 'human') => inOrg(w, () => runTool(name, { pool: scoped, orgId: w.orgId, userId: w.userId, actor, programScope: null, meta: {} }, input));
const q = (w, sql, p) => inOrg(w, () => scoped.query(sql, p));
const statuses = (results) => JSON.stringify(results.map((r) => r.httpStatus));

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Rgc ${stamp}`, `rgc-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`rgc-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    const x = (sql, p) => scoped.query(sql, p);
    await x('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await x(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await x(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.bank = await acct('1000', 'asset');
    await x('UPDATE org_accounts SET is_cash_account = true WHERE id = $1', [w.bank]);
    w.expense = await acct('6500', 'expense');
    w.expense2 = await acct('6600', 'expense');
    w.income = await acct('4000', 'income');
    w.inKindIncome = await acct('4100', 'income');
    w.who = (await x(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Counterparty', 'organization') RETURNING id`, [w.orgId])).rows[0].id;
    for (const role of ['vendor', 'customer']) await x('INSERT INTO org_contact_roles (org_id, constituent_id, role) VALUES ($1, $2, $3)', [w.orgId, w.who, role]);
    w.bill = (await x(`INSERT INTO org_bills (org_id, constituent_id, bill_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'approved', 2026) RETURNING id`, [w.orgId, w.who])).rows[0].id;
    await x(`INSERT INTO org_bill_lines (bill_id, account_id, program_id, amount_cents) VALUES ($1, $2, $3, 10000)`, [w.bill, w.expense, w.program]);
    w.invoice = (await x(`INSERT INTO org_invoices (org_id, constituent_id, invoice_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'sent', 2026) RETURNING id`, [w.orgId, w.who])).rows[0].id;
    await x(`INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, quantity, unit_amount_cents) VALUES ($1, $2, $3, 1, 10000)`, [w.invoice, w.income, w.program]);
    w.gift = (await x(
      `INSERT INTO org_gifts (org_id, gift_type, payment_method, amount_cents, posting_status, program_id, in_kind_description, in_kind_revenue_account_id, in_kind_expense_account_id)
       VALUES ($1, 'donation', 'in_kind', 5000, 'unposted', $2, 'Donated goods', $3, $4) RETURNING id`,
      [w.orgId, w.program, w.inKindIncome, w.expense])).rows[0].id;
    const posted = await postLedgerTransaction(scoped, {
      orgId: w.orgId, userId: w.userId, transactionDate: '2026-03-05', memo: 'Supplies', payee: null, referenceNumber: null, source: 'manual',
      lines: [
        { account_id: w.expense, program_id: w.program, debit_cents: 3000, credit_cents: 0 },
        { account_id: w.bank, program_id: w.program, debit_cents: 0, credit_cents: 3000 },
      ],
    });
    assert.ok(posted.httpStatus < 300, JSON.stringify(posted.body));
    w.expenseLine = (await x('SELECT id FROM org_ledger_lines WHERE transaction_id = $1 AND account_id = $2', [posted.body.id, w.expense])).rows[0].id;
  });
  return w;
}

const count = (w, source) => q(w, `SELECT COUNT(*)::int AS n FROM org_ledger_transactions WHERE org_id = $1 AND source = $2 AND status = 'posted'`, [w.orgId, source]).then((r) => r.rows[0].n);

test.before(() => {
  if (SKIP) return;
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  pool = new pg.Pool({ connectionString: URL, max: 12 });
  scoped = wrapPoolWithOrgScoping(pool);
});
test.after(async () => { if (pool) await pool.end(); });

test('five simultaneous recodes of one line post one correcting journal', { skip: SKIP, todo: 'A repeat of the same recode is accepted: nothing marks a line as already recoded.' }, async () => {
  const w = await makeWorkspace();
  const input = { line_ids: [w.expenseLine], changes: { account_id: w.expense2 }, transaction_date: '2026-03-20' };
  assert.equal((await run(w, 'ledger.recode', input, 'assistant')).httpStatus, 202);
  assert.equal(await count(w, 'recode'), 0);
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'ledger.recode', input)));
  assert.equal(results.filter((r) => r.httpStatus === 201).length, 1, statuses(results));
  assert.equal(await count(w, 'recode'), 1);
});

test('five simultaneous postings of one in-kind gift post once; an assistant only proposes', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const input = { id: w.gift, posting_date: '2026-03-10' };
  assert.equal((await run(w, 'gift.post', input, 'job')).httpStatus, 202);
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'gift.post', input)));
  assert.equal(results.filter((r) => r.httpStatus < 300).length, 1, statuses(results));
  assert.equal(await count(w, 'gift_in_kind'), 1, 'one posted entry');
  const voids = await Promise.all(Array.from({ length: 3 }, () => run(w, 'gift.void_posting', { id: w.gift, void_reason: 'entered twice' })));
  assert.equal(voids.filter((r) => r.httpStatus < 300).length, 1, statuses(voids));
});

for (const [kind, key] of [['bill', 'bill'], ['invoice', 'invoice']]) {
  const table = kind === 'bill' ? 'org_bill_credit_notes' : 'org_invoice_credit_notes';
  const col = kind === 'bill' ? 'original_bill_id' : 'original_invoice_id';
  test(`five simultaneous applies of one ${kind} credit note post once; simultaneous voids void once`, { skip: SKIP }, async () => {
    const w = await makeWorkspace();
    const account = kind === 'bill' ? w.expense : w.income;
    const note = (await q(w,
      `INSERT INTO ${table} (org_id, constituent_id, ${col}, account_id, program_id, amount_cents, fiscal_year, note_date, created_by)
       VALUES ($1,$2,$3,$4,$5,4000,2026,'2026-03-10',$6) RETURNING id`, [w.orgId, w.who, w[key], account, w.program, w.userId])).rows[0].id;
    const tool = `${kind}_credit_note`;
    assert.equal((await run(w, `${tool}.apply`, { id: note }, 'assistant')).httpStatus, 202);
    const applied = await Promise.all(Array.from({ length: 5 }, () => run(w, `${tool}.apply`, { id: note })));
    assert.equal(applied.filter((r) => r.httpStatus === 200).length, 1, statuses(applied));
    assert.equal(await count(w, kind === 'bill' ? 'bill_approval' : 'invoice'), 1);
    const voided = await Promise.all(Array.from({ length: 3 }, () => run(w, `${tool}.void`, { id: note, reason: 'wrong amount' })));
    assert.equal(voided.filter((r) => r.httpStatus === 200).length, 1, statuses(voided));
    const status = (await q(w, `SELECT status FROM ${table} WHERE id = $1`, [note])).rows[0].status;
    assert.equal(status, 'void');
  });
}

test('five simultaneous approvals of one bill post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await q(w, `UPDATE org_bills SET status = 'pending_approval' WHERE id = $1`, [w.bill]);
  assert.equal((await run(w, 'bill.approve', { id: w.bill }, 'assistant')).httpStatus, 202);
  const results = await Promise.all(Array.from({ length: 5 }, () => run(w, 'bill.approve', { id: w.bill })));
  assert.equal(results.filter((r) => r.httpStatus === 200).length, 1, statuses(results));
  assert.equal(await count(w, 'bill_approval'), 1);
});

test('five simultaneous sends of one invoice post once, then simultaneous write-offs post once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await q(w, `UPDATE org_invoices SET status = 'draft' WHERE id = $1`, [w.invoice]);
  assert.equal((await run(w, 'invoice.send', { id: w.invoice, email: false }, 'assistant')).httpStatus, 202);
  const sent = await Promise.all(Array.from({ length: 5 }, () => run(w, 'invoice.send', { id: w.invoice, email: false })));
  assert.equal(sent.filter((r) => r.httpStatus === 200).length, 1, statuses(sent));
  assert.equal(await count(w, 'invoice'), 1);
  const input = { id: w.invoice, bad_debt_expense_account_id: w.expense, reason: 'customer closed', date: '2026-04-01' };
  const off = await Promise.all(Array.from({ length: 5 }, () => run(w, 'invoice.write_off', input)));
  assert.equal(off.filter((r) => r.httpStatus === 200).length, 1, statuses(off));
  assert.equal(await count(w, 'invoice'), 2);
});
