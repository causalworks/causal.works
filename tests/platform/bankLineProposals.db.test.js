'use strict';
// Bank line coding: proposals from bank rules and payee history, one open proposal per line, accepting posts once; coding runs as a tool.
// Needs SMOKE_DATABASE_URL (see ledgerRules.db.test.js).

const test = require('node:test');
const assert = require('node:assert');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext, enterUserContext } = require('../../server/organizational/lib/orgContext');
const { runTool, proposals } = require('../../server/organizational/tools');
const { proposeForUnconfirmedLines } = require('../../server/organizational/lib/bankLineProposals');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

let pool;
let scoped;

function inOrg(w, fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { enterOrgContext(w.orgId); enterUserContext(w.userId); fn().then(resolve, reject); });
  });
}
const ctx = (w, actor = 'human', extra = {}) => ({ pool: scoped, orgId: w.orgId, userId: w.userId, actor, programScope: null, meta: {}, ...extra });

async function makeWorkspace() {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const org = (await pool.query(`INSERT INTO coop_members (display_name, slug) VALUES ($1, $2) RETURNING id`, [`Prop ${stamp}`, `prop-${stamp}`])).rows[0];
  const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`prop-${stamp}@example.test`])).rows[0];
  const w = { orgId: org.id, userId: user.id };
  await inOrg(w, async () => {
    const q = (sql, p) => scoped.query(sql, p);
    await q('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [w.orgId]);
    w.program = (await q(`INSERT INTO org_programs (org_id, name) VALUES ($1, 'General') RETURNING id`, [w.orgId])).rows[0].id;
    const acct = async (code, type) => (await q(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`,
      [w.orgId, code, type])).rows[0].id;
    w.bank = await acct('1000', 'asset');
    await q('UPDATE org_accounts SET is_cash_account = true WHERE id = $1', [w.bank]);
    w.expense = await acct('6500', 'expense');
    w.expense2 = await acct('6600', 'expense');
    const who = (await q(`INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Counterparty', 'organization') RETURNING id`, [w.orgId])).rows[0].id;
    await q('INSERT INTO org_contact_roles (org_id, constituent_id, role) VALUES ($1, $2, $3)', [w.orgId, who, 'vendor']);
    w.bill = (await q(`INSERT INTO org_bills (org_id, constituent_id, bill_date, status, fiscal_year) VALUES ($1, $2, '2026-03-01', 'approved', 2026) RETURNING id`, [w.orgId, who])).rows[0].id;
    await q(`INSERT INTO org_bill_lines (bill_id, account_id, program_id, amount_cents) VALUES ($1, $2, $3, 10000)`, [w.bill, w.expense, w.program]);
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


let seq = 0;
const addLine = (w, payee, cents = 5000, dir = 'debit') => inOrg(w, () => scoped.query(
  `INSERT INTO org_bank_statement_lines (org_id, bank_account_id, statement_date, amount_cents, credit_debit_indicator, payee_raw, description_raw, import_fingerprint)
   VALUES ($1, $2, '2026-03-10', $3, $4, $5, 'x', $6) RETURNING id`,
  [w.orgId, w.bank, cents, dir, payee, `fp-${Date.now()}-${++seq}-${Math.random()}`])).then((r) => r.rows[0].id);
const code = (w, lineId, account, actor = 'human') => inOrg(w, () => runTool('bank_line.code', ctx(w, actor), { line_id: lineId, account_id: account, program_id: w.program }));
const on = (w) => inOrg(w, () => scoped.query(`UPDATE org_settings SET assistant_mode = 'background' WHERE org_id = $1`, [w.orgId]));
const prepare = (w) => inOrg(w, () => proposeForUnconfirmedLines(scoped, w.orgId));

test('coding a bank line posts once when five people code it at once', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  const line = await addLine(w, 'Acme Supplies');
  const results = await Promise.all(Array.from({ length: 5 }, () => code(w, line, w.expense)));
  assert.equal(results.filter((r) => r.httpStatus === 201).length, 1);
  assert.equal(results.filter((r) => r.httpStatus === 409).length, 4);
});

test('nothing is prepared while the assistant is off', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await code(w, await addLine(w, 'Acme Supplies'), w.expense);
  await addLine(w, 'Acme Supplies');
  const out = await prepare(w);
  assert.equal(out.proposed, 0);
  assert.ok(out.skipped);
});

test('a payee coded before gets a proposal with a reason; accepting posts it; no second proposal for the same line', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await on(w);
  await code(w, await addLine(w, 'Acme Supplies'), w.expense);
  await code(w, await addLine(w, 'acme supplies '), w.expense);
  await code(w, await addLine(w, 'Acme Supplies'), w.expense2);
  const fresh = await addLine(w, 'Acme Supplies');
  await addLine(w, 'Never Seen Before');
  assert.equal((await prepare(w)).proposed, 1);
  assert.equal((await prepare(w)).proposed, 0);
  const [p] = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  assert.match(p.reason, /Same coding as 2 of 3 past payments to this payee\./);
  assert.equal(p.proposer_kind, 'job');
  assert.equal(p.warnings.length, 1);
  assert.equal(p.input.line_id, fresh);
  const done = await inOrg(w, () => proposals.acceptProposal(ctx(w), p.id));
  assert.equal(done.httpStatus, 201);
  const st = (await inOrg(w, () => scoped.query('SELECT status FROM org_bank_statement_lines WHERE id = $1', [fresh]))).rows[0].status;
  assert.equal(st, 'confirmed');
});

test('a bank rule beats history and is recorded as the coding source; a line coded by hand expires its proposal', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await on(w);
  await code(w, await addLine(w, 'Acme Supplies'), w.expense);
  await inOrg(w, () => scoped.query(
    `INSERT INTO org_bank_rules (org_id, name, payee_contains, action_account_id, action_program_id) VALUES ($1, 'Acme rule', 'acme', $2, $3)`,
    [w.orgId, w.expense2, w.program]));
  const line = await addLine(w, 'Acme Supplies');
  await prepare(w);
  const [p] = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  assert.equal(p.input.account_id, w.expense2);
  assert.equal(p.input.coding_source, 'rule');
  assert.match(p.reason, /Acme rule/);
  await code(w, line, w.expense);
  const again = await prepare(w);
  assert.equal(again.expired, 1);
  assert.equal((await inOrg(w, () => proposals.listProposals(scoped, w.orgId))).length, 0);
});

test('accepting a proposal whose line was already coded expires it', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await on(w);
  await code(w, await addLine(w, 'Acme Supplies'), w.expense);
  const line = await addLine(w, 'Acme Supplies');
  await prepare(w);
  const [p] = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  await code(w, line, w.expense);
  assert.equal((await inOrg(w, () => proposals.acceptProposal(ctx(w), p.id))).httpStatus, 409);
  assert.equal((await inOrg(w, () => proposals.listProposals(scoped, w.orgId, { status: 'expired' }))).length, 1);
});

const { grantSeat } = require('../../server/organizational/lib/assistantSeat');
const { clean } = require('../../server/organizational/lib/bankLineModel');
const withModel = (w, modelSuggest) => inOrg(w, () => proposeForUnconfirmedLines(scoped, w.orgId, { modelSuggest, modelEnabled: () => true, modelDelayMs: 0 }));
const seat = (w) => inOrg(w, () => grantSeat(scoped, { orgId: w.orgId, userId: w.userId, reason: 'test seat' }));
const stub = (w, calls) => async (_pool, _org, line) => {
  calls.push(line.id);
  return { input: { line_id: line.id, account_id: w.expense, program_id: w.program, coding_source: 'manual' }, reason: 'Language model suggestion', evidence: { basis: 'model' }, warnings: null, model: 'test-model', promptVersion: 'v-test' };
};

test('leftover lines go to the model only with the assistant on and a live seat; the proposal records the model and the assistant', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await on(w);
  const line = await addLine(w, 'Never Seen Before');
  const calls = [];
  const noSeat = await withModel(w, stub(w, calls));
  assert.equal(noSeat.proposedByModel, 0);
  assert.equal(calls.length, 0);
  await seat(w);
  const out = await withModel(w, stub(w, calls));
  assert.equal(out.proposedByModel, 1);
  const [p] = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  assert.equal(p.proposer_kind, 'assistant');
  assert.equal(p.model, 'test-model');
  assert.equal(p.prompt_version, 'v-test');
  assert.equal(p.input.line_id, line);
});

test('a line the model has looked at is not sent again, and nothing is sent while the assistant is off', { skip: SKIP }, async () => {
  const w = await makeWorkspace();
  await seat(w);
  await addLine(w, 'Never Seen Before');
  const calls = [];
  await withModel(w, stub(w, calls));
  assert.equal(calls.length, 0);
  await on(w);
  await withModel(w, async (...a) => { calls.push(a[2].id); return null; });
  await withModel(w, async (...a) => { calls.push(a[2].id); return null; });
  assert.equal(calls.length, 1);
});

test('text sent to the model drops long numbers, emails and links', () => {
  assert.equal(clean('PAYMENT 1234567890 to bob@example.org https://x.test/y ref'), 'PAYMENT to ref');
});

test('the scheduled job prepares proposals for workspaces whose assistant is on and skips the rest', { skip: SKIP }, async () => {
  const { runBankCodingProposalsJob } = require('../../server/jobs/bank-coding-proposals-job');
  const [on1, off1] = [await makeWorkspace(), await makeWorkspace()];
  for (const w of [on1, off1]) {
    await code(w, await addLine(w, 'Acme Supplies'), w.expense);
    await addLine(w, 'Acme Supplies');
  }
  await on(on1);
  await runBankCodingProposalsJob(pool);
  assert.equal((await inOrg(on1, () => proposals.listProposals(scoped, on1.orgId))).length, 1);
  assert.equal((await inOrg(off1, () => proposals.listProposals(scoped, off1.orgId))).length, 0);
});

test('measurement counts accepted, hand-coded the same, hand-coded differently and dismissed, by month, payee and account', { skip: SKIP }, async () => {
  const { measure } = require('../../server/organizational/lib/proposalMeasurement');
  const w = await makeWorkspace();
  await on(w);
  await code(w, await addLine(w, 'Acme Supplies'), w.expense);
  const lines = [await addLine(w, 'Acme Supplies'), await addLine(w, 'Acme Supplies'), await addLine(w, 'Acme Supplies'), await addLine(w, 'Acme Supplies')];
  await prepare(w);
  const open = await inOrg(w, () => proposals.listProposals(scoped, w.orgId));
  const forLine = (id) => open.find((p) => p.input.line_id === id);
  await inOrg(w, () => proposals.acceptProposal(ctx(w), forLine(lines[0]).id));
  await code(w, lines[1], w.expense);
  await code(w, lines[2], w.expense2);
  await inOrg(w, () => proposals.dismissProposal(ctx(w), forLine(lines[3]).id));
  await prepare(w);
  const m = await inOrg(w, () => measure(scoped, w.orgId));
  assert.equal(m.by_month.length, 1);
  assert.deepEqual([m.by_month[0].agreed, m.by_month[0].changed, m.by_month[0].dismissed], [2, 1, 1]);
  assert.equal(m.by_source[0].key, 'payee_history');
  assert.equal(m.by_source[0].total, 4);
  assert.equal(m.by_payee[0].key, 'acme supplies');
  assert.equal(m.by_payee[0].override_rate, 0.5);
  assert.equal(m.open, 0);
});
