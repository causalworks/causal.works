'use strict';

// Sponsorship S1 against a throwaway database: gift coding to the project fund, balance and tie-out from real rows,
// the fee run (preview, confirm, rerun, reversal, locked year), fee rule locking, settings and access.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');

const opts = { skip: h.SKIP };

test('a project gift posts to the project program with a restricted class', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws);
    const gift = await h.one(pool,
      `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, posting_status, payment_method,
                              in_kind_description, in_kind_valuation_method, program_id)
       VALUES ($1, 'donation', 25000, '2026-02-01', $2, 'unposted', 'in_kind', 'Laptops', 'comparable_sales', $3) RETURNING id`,
      [ws.orgId, project.id, ws.programs.admin]);
    const inKindRev = await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, '4100', 'Gifts in kind', 'income', true, 3) RETURNING id`, [ws.orgId]);
    await asApp(ws.orgId);
    const { postInKindGift } = require('../../server/organizational/lib/giftPosting');
    const out = await postInKindGift(pool, { orgId: ws.orgId, userId: ws.users[1].id, giftId: gift.id, postingDate: '2026-02-01',
      revenueAccountId: inKindRev.id, expenseAccountId: ws.accounts.projectExpense, programId: ws.programs.admin });
    assert.equal(out.httpStatus, 200, JSON.stringify(out.body));
    const lines = await pool.query('SELECT program_id, donor_restriction_class::text AS c FROM org_ledger_lines WHERE transaction_id = $1', [out.body.ledger_transaction_id]);
    assert.ok(lines.rows.every((l) => Number(l.program_id) === Number(project.program_id) && l.c === 'temporarily_restricted'));
  });
});

test('a project with no program cannot have its gift posted, with a plain message', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws, { programId: null });
    const gift = await h.one(pool,
      `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, posting_status, payment_method, in_kind_description, in_kind_valuation_method)
       VALUES ($1, 'donation', 100, '2026-02-01', $2, 'unposted', 'in_kind', 'Chairs', 'comparable_sales') RETURNING id`, [ws.orgId, project.id]);
    await asApp(ws.orgId);
    const { postInKindGift } = require('../../server/organizational/lib/giftPosting');
    const out = await postInKindGift(pool, { orgId: ws.orgId, userId: ws.users[1].id, giftId: gift.id, postingDate: '2026-02-01', revenueAccountId: 1, expenseAccountId: 1, programId: 1 });
    assert.equal(out.httpStatus, 400);
    assert.match(out.body.error, /Link the project to a program/);
  });
});

test('balance from the database: every part, and the tie-out agrees after a fee is posted', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws);
    await h.seedPostedGift(pool, ws, project, 100000, '2026-01-15');
    await h.seedPostedGift(pool, ws, project, 50000, '2026-02-15', { exempt: true });
    await h.seedUnpostedGift(pool, ws, project, 20000, '2026-03-01');
    await asApp(ws.orgId);
    const { loadProjectBalance } = require('../../server/organizational/lib/sponsorBalance');
    const { runFees } = require('../../server/organizational/lib/sponsorFeePosting');
    let b = (await loadProjectBalance(pool, ws.orgId, project.id, { asOf: '2026-04-10' })).balance;
    assert.equal(b.received_posted_cents, 150000);
    assert.equal(b.received_unposted_cents, 20000);
    assert.equal(b.fees_accrued_cents, 6000);
    assert.equal(b.fees_posted_cents, 0);
    assert.equal(b.tie_out.difference_cents, 0);
    const run = await runFees(pool, { orgId: ws.orgId, userId: ws.users[1].id, throughDate: '2026-04-10' });
    assert.equal(run.body.posted_count, 1, JSON.stringify(run.body));
    b = (await loadProjectBalance(pool, ws.orgId, project.id, { asOf: '2026-04-10' })).balance;
    assert.equal(b.fees_posted_cents, 6000);
    assert.equal(b.available_cents, 150000 - 6000);
    assert.equal(b.tie_out.difference_cents, 0);
  });
});

test('fee run: preview, confirm, rerun creates nothing, reversal makes it due again, locked year refused', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 5, minimum_quarter_cents: 10000 } });
    await h.seedPostedGift(pool, ws, project, 100000, '2026-01-20');
    await asApp(ws.orgId);
    const { previewFees, runFees, voidFeePosting } = require('../../server/organizational/lib/sponsorFeePosting');
    const preview = await previewFees(pool, ws.orgId, '2026-06-30');
    assert.deepEqual(preview.rows.map((r) => [r.period_end, r.due_cents]), [['2026-03-31', 10000], ['2026-06-30', 10000]]);
    assert.ok(preview.rows.every((r) => r.minimum_applied));

    const first = await runFees(pool, { orgId: ws.orgId, userId: ws.users[1].id, throughDate: '2026-06-30' });
    assert.equal(first.body.posted_count, 2);
    const lines = await pool.query(
      `SELECT l.account_id, l.program_id, l.donor_restriction_class::text AS c, l.debit_cents, l.credit_cents, t.source
         FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id WHERE t.id = $1 ORDER BY l.id`, [first.body.posted[0].ledger_transaction_id]);
    assert.equal(lines.rows[0].source, 'sponsor_fee');
    assert.deepEqual([Number(lines.rows[0].account_id), Number(lines.rows[0].program_id), lines.rows[0].c, Number(lines.rows[0].debit_cents)],
      [ws.accounts.feeExpense, ws.programs.projectA, 'temporarily_restricted', 10000]);
    assert.deepEqual([Number(lines.rows[1].account_id), Number(lines.rows[1].program_id), lines.rows[1].c, Number(lines.rows[1].credit_cents)],
      [ws.accounts.feeIncome, ws.programs.admin, 'unrestricted', 10000]);

    const second = await runFees(pool, { orgId: ws.orgId, userId: ws.users[1].id, throughDate: '2026-06-30' });
    assert.equal(second.body.posted_count, 0);
    assert.equal(second.body.failed_count, 0);

    const noReason = await voidFeePosting(pool, { orgId: ws.orgId, userId: ws.users[1].id, postingId: first.body.posted[0].id, reason: ' ' });
    assert.equal(noReason.httpStatus, 400);
    const voided = await voidFeePosting(pool, { orgId: ws.orgId, userId: ws.users[1].id, postingId: first.body.posted[0].id, reason: 'Charged twice by mistake' });
    assert.equal(voided.httpStatus, 200);
    const again = await previewFees(pool, ws.orgId, '2026-06-30');
    assert.deepEqual(again.rows.map((r) => r.period_end), ['2026-03-31']);

    await client.query('RESET ROLE');
    await pool.query(`INSERT INTO org_fiscal_year_locks (org_id, fiscal_year, locked_at) VALUES ($1, 2026, now())`, [ws.orgId]);
    await asApp(ws.orgId);
    const locked = await runFees(pool, { orgId: ws.orgId, userId: ws.users[1].id, throughDate: '2026-06-30' });
    assert.equal(locked.body.posted_count, 0);
    assert.equal(locked.body.failed_count, 1);
    assert.equal(locked.body.failed[0].code, 'fiscal_year_locked');
    const left = await pool.query('SELECT COUNT(*)::int AS n FROM org_sponsor_fee_postings WHERE org_id = $1 AND voided_at IS NULL', [ws.orgId]);
    assert.equal(left.rows[0].n, 1);
  });
});

test('fee run refuses to post until the fee accounts are set, and says what to set', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    await pool.query('UPDATE org_sponsor_settings SET fee_income_account_id = NULL WHERE org_id = $1', [ws.orgId]);
    const project = await h.seedProject(pool, ws);
    await h.seedPostedGift(pool, ws, project, 100000, '2026-01-20');
    await asApp(ws.orgId);
    const { runFees } = require('../../server/organizational/lib/sponsorFeePosting');
    const out = await runFees(pool, { orgId: ws.orgId, userId: ws.users[1].id, throughDate: '2026-03-31' });
    assert.equal(out.body.posted_count, 0);
    assert.match(out.body.failed[0].error, /fee income account/);
  });
});

test('fee rule: edited in place before signing, amendment with document and reason after', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws);
    await asApp(ws.orgId);
    const r = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
    const path = '/api/organizational/orgs/:slug/sponsored-projects/:id/fee-rules';
    const finance = { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, params: { slug: ws.slug, id: String(project.id) } };

    let res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 7 } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.rule.rate, 7);
    let rules = await pool.query('SELECT COUNT(*)::int AS n FROM org_sponsor_fee_rules WHERE sponsored_project_id = $1', [project.id]);
    assert.equal(rules.rows[0].n, 1);

    await client.query('RESET ROLE');
    await pool.query(`UPDATE org_sponsored_projects SET agreement_signed_at = '2026-01-05' WHERE id = $1`, [project.id]);
    const doc = await h.one(pool,
      `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, sponsored_project_id)
       VALUES ($1, 'other', 'Fee amendment', 'a.pdf', 'x/a.pdf', 'application/pdf', 1, 'x', $2) RETURNING id`, [ws.orgId, project.id]);
    await asApp(ws.orgId);

    res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 5 } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'amendment_date_required');
    res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 5, effective_from: '2026-07-01' } });
    assert.equal(res.body.code, 'amendment_document_required');
    res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 5, effective_from: '2026-07-01', amendment_document_id: doc.id } });
    assert.equal(res.body.code, 'reason_required');
    res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 5, effective_from: '2025-07-01', amendment_document_id: doc.id, reason: 'Board approved a lower rate' } });
    assert.equal(res.statusCode, 400);
    res = await r.call('POST', path, { ...finance, body: { kind: 'percent', rate: 5, effective_from: '2026-07-01', amendment_document_id: doc.id, reason: 'Board approved a lower rate' } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    rules = await pool.query('SELECT rate::float AS rate FROM org_sponsor_fee_rules WHERE sponsored_project_id = $1 ORDER BY effective_from', [project.id]);
    assert.deepEqual(rules.rows.map((x) => x.rate), [7, 5]);
    const audit = await pool.query(`SELECT COUNT(*)::int AS n FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_sponsor_fee_rules'`, [ws.orgId]);
    assert.ok(audit.rows[0].n >= 2);
  });
});

test('access: board reads but cannot change; a program lead sees only their project; fundraising cannot read balances', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const a = await h.seedProject(pool, ws, { name: 'Project A', programId: ws.programs.projectA });
    const b = await h.seedProject(pool, ws, { name: 'Project B', programId: ws.programs.projectB });
    await h.seedPostedGift(pool, ws, b, 5000, '2026-01-10');
    const r = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
    const balance = '/api/organizational/orgs/:slug/sponsored-projects/:id/balance';
    const rules = '/api/organizational/orgs/:slug/sponsored-projects/:id/fee-rules';

    await asApp(ws.orgId);
    let res = await r.call('GET', balance, { user: ws.users[2].id, role: 'board', orgId: ws.orgId, params: { id: String(a.id) } });
    assert.equal(res.statusCode, 200);
    res = await r.call('POST', rules, { user: ws.users[2].id, role: 'board', orgId: ws.orgId, params: { id: String(a.id) }, body: { kind: 'percent', rate: 1 } });
    assert.equal(res.statusCode, 403);
    assert.match(res.body.error, /Ask an admin/);
    res = await r.call('GET', balance, { user: ws.users[1].id, role: 'fundraising', orgId: ws.orgId, params: { id: String(a.id) } });
    assert.equal(res.statusCode, 403);

    await asApp(ws.orgId, [ws.programs.projectA]);
    res = await r.call('GET', balance, { user: ws.users[3].id, role: 'program', orgId: ws.orgId, params: { id: String(a.id) } });
    assert.equal(res.statusCode, 200);
    res = await r.call('GET', balance, { user: ws.users[3].id, role: 'program', orgId: ws.orgId, params: { id: String(b.id) } });
    assert.equal(res.statusCode, 404);
    const seen = await pool.query('SELECT COUNT(*)::int AS n FROM org_sponsor_fee_rules');
    assert.equal(seen.rows[0].n, 1);
  });
});

test('settings: only finance and admins change them, accounts are checked, changes are logged', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    await asApp(ws.orgId);
    const r = h.loadRoutes('routes/sponsorship.js', 'registerSponsorshipRoutes', pool);
    const p = '/api/organizational/orgs/:slug/sponsor-settings';
    let res = await r.call('PUT', p, { user: ws.users[2].id, role: 'board', orgId: ws.orgId, body: { overdue_report_hold_days: 10 } });
    assert.equal(res.statusCode, 403);
    res = await r.call('PUT', p, { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, body: { fee_income_account_id: ws.accounts.feeExpense } });
    assert.equal(res.statusCode, 400);
    res = await r.call('PUT', p, { user: ws.users[1].id, role: 'finance', orgId: ws.orgId, body: { overdue_report_hold_days: 10, second_approval_threshold_cents: 250000 } });
    assert.equal(res.statusCode, 200);
    res = await r.call('GET', p, { user: ws.users[2].id, role: 'board', orgId: ws.orgId });
    assert.equal(res.body.settings.overdue_report_hold_days, 10);
    const audit = await pool.query(`SELECT field_name FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_sponsor_settings' ORDER BY field_name`, [ws.orgId]);
    assert.deepEqual(audit.rows.map((x) => x.field_name), ['overdue_report_hold_days', 'second_approval_threshold_cents']);
  });
});

test('untagged gifts in a sponsor workspace are flagged in Gift Postings until reviewed', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws);
    const giftId = await h.seedUnpostedGift(pool, ws, null, 3000, '2026-03-01');
    await asApp(ws.orgId);
    const r = h.loadRoutes('routes/giftPostings.js', 'registerGiftPostingRoutes', pool);
    const finance = { user: ws.users[1].id, role: 'finance', orgId: ws.orgId };
    let res = await r.call('GET', '/api/organizational/orgs/:slug/gift-postings', finance);
    assert.deepEqual(res.body.sponsor_untagged.map((g) => g.id), [giftId]);
    res = await r.call('POST', '/api/organizational/orgs/:slug/gift-postings/:giftId/sponsor-review', { ...finance, params: { giftId: String(giftId) }, body: {} });
    assert.equal(res.statusCode, 400);
    res = await r.call('POST', '/api/organizational/orgs/:slug/gift-postings/:giftId/sponsor-review', { ...finance, params: { giftId: String(giftId) }, body: { sponsored_project_id: project.id } });
    assert.equal(res.statusCode, 200);
    res = await r.call('GET', '/api/organizational/orgs/:slug/gift-postings', finance);
    assert.equal(res.body.sponsor_untagged.length, 0);
  });
});

test('a bill paid straight from the project program lowers the available balance and keeps the tie-out', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 0 } });
    await h.seedPostedGift(pool, ws, project, 100000, '2026-01-15');
    const t = await h.one(pool, `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source) VALUES ($1, '2026-02-01', 2026, 'Venue', 'bill_approval') RETURNING id`, [ws.orgId]);
    await pool.query(`INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents) VALUES ($1, $2, $3, 30000, 0), ($1, $4, $3, 0, 30000)`,
      [t.id, ws.accounts.projectExpense, project.program_id, ws.accounts.bank]);
    await asApp(ws.orgId);
    const { loadProjectBalance } = require('../../server/organizational/lib/sponsorBalance');
    const b = (await loadProjectBalance(pool, ws.orgId, project.id, { asOf: '2026-03-01' })).balance;
    assert.equal(b.other_spending_cents, 30000);
    assert.equal(b.available_cents, 70000);
    assert.equal(b.tie_out.difference_cents, 0);
  });
});
