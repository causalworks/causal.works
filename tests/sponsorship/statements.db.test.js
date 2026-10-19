'use strict';

// Sponsorship S4 against a throwaway database: the monthly statement (figures, stored document, one email, nothing new on a rerun),
// the scheduled run, the year-end sheet tying to the books, donor letters, and releasing donated property as a grant at value.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug';
process.env.CAUSAL_UPLOADS_ROOT = process.env.CAUSAL_UPLOADS_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-test-'));

function fakePdf() {
  const docs = require('../../server/organizational/lib/sponsorDocuments');
  let n = 0;
  docs.setPdfRenderer(async (html) => Buffer.from('%PDF test ' + (++n) + ' ' + html.length + ' ' + Math.random()));
  return () => docs.setPdfRenderer(null);
}

async function setup(pool, asApp) {
  const ws = await h.seedWorkspace(pool);
  const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 10 } });
  const lead = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind, email) VALUES ($1, 'Project lead', 'individual', 'lead@example.test') RETURNING id`, [ws.orgId]);
  await pool.query('UPDATE org_sponsored_projects SET lead_constituent_id = $1 WHERE id = $2', [lead.id, project.id]);
  await pool.query(`UPDATE org_settings SET reply_to_email = 'office@example.test' WHERE org_id = $1`, [ws.orgId]);
  await h.seedPostedGift(pool, ws, project, 100000, '2026-01-10');
  await h.seedPostedGift(pool, ws, project, 50000, '2026-02-12');
  const t = await h.one(pool, `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source) VALUES ($1, '2026-02-20', 2026, 'Paid', 'sponsored_disbursement') RETURNING id`, [ws.orgId]);
  await pool.query(`INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents) VALUES ($1, $2, $3, 30000, 0), ($1, $4, $3, 0, 30000)`,
    [t.id, ws.accounts.projectExpense, project.program_id, ws.accounts.bank]);
  await pool.query(`INSERT INTO org_sponsored_project_disbursements (org_id, sponsored_project_id, disbursement_date, amount_cents, status, ledger_transaction_id, notes)
                    VALUES ($1, $2, '2026-02-20', 30000, 'approved', $3, 'Printing')`, [ws.orgId, project.id, t.id]);
  await asApp(ws.orgId);
  const r = h.loadRoutes('routes/sponsorshipRecords.js', 'registerSponsorshipRecordRoutes', pool);
  const as = (i, extra) => ({ user: ws.users[i].id, role: ws.users[i].role, orgId: ws.orgId, params: { slug: ws.slug, id: String(project.id), ...(extra || {}) } });
  return { ws, project, lead, r, as };
}

test('monthly statement: right figures, stored as a document, emailed once to the lead; a second run makes nothing', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const restore = fakePdf();
    try {
      const { ws, project } = await setup(pool, asApp);
      const { generateStatement } = require('../../server/organizational/lib/sponsorStatements');
      const sent = [];
      const send = async (m) => { sent.push(m); return true; };
      const out = await generateStatement(pool, { orgId: ws.orgId, userId: ws.users[1].id, projectId: project.id, month: '2026-02', send: true, sendEmail: send });
      assert.equal(out.httpStatus, 201, JSON.stringify(out.body));
      const s = out.body.statement;
      assert.deepEqual([Number(s.opening_cents), Number(s.income_cents), Number(s.expenses_cents), Number(s.closing_cents)], [90000, 50000, 30000, 105000]);
      assert.equal(Number(s.fees_cents), 5000);
      assert.equal(s.send_status, 'sent');
      assert.equal(sent.length, 1);
      assert.equal(sent[0].to, 'lead@example.test');
      assert.equal(sent[0].replyTo, 'office@example.test');
      assert.equal(sent[0].attachments.length, 1);
      const doc = await h.one(pool, 'SELECT sponsored_project_id FROM org_documents WHERE id = $1', [s.generated_document_id]);
      assert.equal(doc.sponsored_project_id, project.id);

      const again = await generateStatement(pool, { orgId: ws.orgId, userId: ws.users[1].id, projectId: project.id, month: '2026-02', send: true, sendEmail: send });
      assert.equal(again.body.created, false);
      assert.equal(sent.length, 1);
      const count = await h.one(pool, 'SELECT COUNT(*)::int AS n FROM org_sponsor_statements WHERE sponsored_project_id = $1', [project.id]);
      assert.equal(count.n, 1);
    } finally { restore(); }
  });
});

test('scheduled statements: the claim makes each month once', opts, async () => {
  await h.withDb(async ({ pool, asApp, client }) => {
    const restore = fakePdf();
    try {
      const { ws, project } = await setup(pool, asApp);
      await client.query('RESET ROLE');
      await pool.query(`UPDATE org_sponsor_settings SET statement_day_of_month = 1, created_at = now() - interval '90 days' WHERE org_id = $1`, [ws.orgId]);
      await asApp(ws.orgId);
      const { runStatementJob } = require('../../server/organizational/lib/sponsorStatements');
      const sent = [];
      const first = await runStatementJob(pool, pool, { sendEmail: async (m) => { sent.push(m); return true; } });
      const mine = await pool.query('SELECT month::text, send_status FROM org_sponsor_statements WHERE sponsored_project_id = $1', [project.id]);
      assert.equal(mine.rows.length, 1);
      assert.ok(first.made >= 1);
      const second = await runStatementJob(pool, pool, { sendEmail: async (m) => { sent.push(m); return true; } });
      assert.equal(second.made, 0);
      assert.equal(sent.filter((m) => m.to === 'lead@example.test').length, 1);
    } finally { restore(); }
  });
});

test('year-end sheet ties to the books by fund, and exports as CSV', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { r, as } = await setup(pool, asApp);
    const res = await r.call('GET', P + '/sponsor-reports/year-end', { ...as(1), query: { fiscal_year: '2026' } });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const row = res.body.rows[0];
    assert.equal(row.income_cents, 150000);
    assert.equal(row.expenses_cents, 30000);
    assert.equal(row.difference_cents, 0);
    const csv = await r.call('GET', P + '/sponsor-reports/year-end', { ...as(1), query: { fiscal_year: '2026', format: 'csv' } });
    assert.match(String(csv.body), /Project A,0\.00,1500\.00/);
    const lead = await r.call('GET', P + '/sponsor-reports/year-end', { ...as(3), query: { fiscal_year: '2026' } });
    assert.equal(lead.statusCode, 403);
  });
});

test('donor letters: a large check to a project is flagged until the signed letter is attached', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    const g = await h.one(pool, `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, payment_method) VALUES ($1, 'donation', 900000, '2026-03-01', $2, 'check') RETURNING id`, [ws.orgId, project.id]);
    let res = await r.call('GET', P + '/sponsored-projects/:id/donor-letters', as(2));
    assert.deepEqual(res.body.gifts.map((x) => [x.id, x.missing]), [[g.id, true]]);
    const tpl = await r.call('GET', P + '/sponsored-projects/:id/gifts/:giftId/donor-letter-template', as(1, { giftId: String(g.id) }));
    assert.match(String(tpl.body), /Project A/);
    const doc = await h.one(pool, `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, sponsored_project_id)
      VALUES ($1, 'other', 'Signed letter', 'l.pdf', 'x/l.pdf', 'application/pdf', 1, md5(random()::text), $2) RETURNING id`, [ws.orgId, project.id]);
    res = await r.call('POST', P + '/sponsored-projects/:id/gifts/:giftId/donor-letter', { ...as(1, { giftId: String(g.id) }), body: { document_id: doc.id } });
    assert.equal(res.statusCode, 200);
    res = await r.call('GET', P + '/sponsored-projects/:id/donor-letters', as(2));
    assert.equal(res.body.gifts[0].missing, false);
  });
});

test('donated property kept as an asset is released as a grant at value through Accounting; an expensed item is refused', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const { ws, project, r, as } = await setup(pool, asApp);
    const asset = await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, '1500', 'Donated equipment', 'asset', true, 3) RETURNING id`, [ws.orgId]);
    const gift = await h.one(pool, `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, payment_method, posting_status, in_kind_description, in_kind_expense_account_id)
      VALUES ($1, 'donation', 120000, '2026-03-01', $2, 'in_kind', 'posted', 'Sound equipment', $3) RETURNING id`, [ws.orgId, project.id, asset.id]);
    const expensed = await h.one(pool, `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, payment_method, posting_status, in_kind_description, in_kind_expense_account_id)
      VALUES ($1, 'donation', 5000, '2026-03-01', $2, 'in_kind', 'posted', 'Snacks', $3) RETURNING id`, [ws.orgId, project.id, ws.accounts.projectExpense]);
    let res = await r.call('POST', P + '/sponsored-projects/:id/property-releases', { ...as(1), body: { gift_id: expensed.id } });
    assert.equal(res.statusCode, 409);
    res = await r.call('POST', P + '/sponsored-projects/:id/property-releases', { ...as(1), body: { gift_id: gift.id, release_date: '2026-03-15' } });
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    const disbId = res.body.disbursement.id;
    res = await r.call('POST', P + '/sponsored-projects/:id/property-releases', { ...as(1), body: { gift_id: gift.id } });
    assert.equal(res.statusCode, 409);

    const { approveDisbursement } = require('../../server/organizational/lib/sponsorMoneyOut');
    const appr = await approveDisbursement(pool, { orgId: ws.orgId, userId: ws.users[4].id, role: 'finance', projectId: project.id, disbursementId: disbId });
    assert.equal(appr.body.status, 'approved', JSON.stringify(appr.body));
    const { postDisbursement } = require('../../server/organizational/lib/disbursementPosting');
    const posted = await postDisbursement(pool, { orgId: ws.orgId, userId: ws.users[1].id, disbursementId: disbId, postingDate: '2026-03-15' });
    assert.equal(posted.httpStatus, 200, JSON.stringify(posted.body));
    const lines = await pool.query('SELECT account_id, debit_cents, credit_cents FROM org_ledger_lines WHERE transaction_id = $1 ORDER BY id', [posted.body.ledger_transaction_id]);
    assert.deepEqual(lines.rows.map((l) => [Number(l.account_id), Number(l.debit_cents), Number(l.credit_cents)]),
      [[ws.accounts.projectExpense, 120000, 0], [asset.id, 0, 120000]]);
    const { loadProjectBalance } = require('../../server/organizational/lib/sponsorBalance');
    const b = (await loadProjectBalance(pool, ws.orgId, project.id)).balance;
    assert.equal(b.disbursed_posted_cents, 30000);
  });
});
