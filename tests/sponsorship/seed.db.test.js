'use strict';

// The Sponsorship sample-data script against a throwaway database: apply, apply again (no change), what the balance
// helper, the Accounting fee preview, the overview and the dashboard show for the seeded rows, and remove (back to the start).

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');
const h = require('./helpers');

const opts = { skip: h.SKIP };
process.env.CAUSAL_UPLOADS_ROOT = process.env.CAUSAL_UPLOADS_ROOT || fs.mkdtempSync(path.join(os.tmpdir(), 'sponsor-seed-'));

const seed = require('../../scripts/seed-sponsorship-demo');
const docs = require('../../server/organizational/lib/sponsorDocuments');

const ZERO = { projects: 0, contacts: 0, gifts: 0, requests: 0, disbursements: 0, documents: 0, applications: 0, ledger_entries: 0 };

test('seed: refuses a workspace without a program or bank account, and says what to set first', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Empty workspace', 'empty-' || floor(random() * 1e9)::text) RETURNING id`);
    await pool.query('INSERT INTO org_settings (org_id) VALUES ($1)', [org.id]);
    const pre = await seed.prerequisites(pool, org.id);
    assert.ok(pre.problems.some((p) => /program/.test(p)));
    assert.ok(pre.problems.some((p) => /bank account/.test(p)));
    assert.ok(pre.problems.some((p) => /finance or admin user/.test(p)));
  });
});

test('seed: apply creates the sample set, a second run changes nothing, and remove takes it all away', opts, async () => {
  let n = 0;
  docs.setPdfRenderer(async (html) => Buffer.from('%PDF seed test ' + (++n) + ' ' + html.length + ' ' + Math.random()));
  try {
    await h.withDb(async ({ pool, asApp, asOwner }) => {
      const ws = await h.seedWorkspace(pool);
      await asApp(ws.orgId);
      assert.deepEqual(await seed.counts(pool, ws.orgId), ZERO);

      const r = await seed.apply(pool, ws.orgId, {});
      assert.equal(r.created, true, JSON.stringify(r));
      assert.equal(r.leadLinks.length, 3);
      const after = await seed.counts(pool, ws.orgId);
      assert.deepEqual(after, { projects: 3, contacts: 10, gifts: 9, requests: 8, disbursements: 6, documents: 12, applications: 4, ledger_entries: 4 });

      const again = await seed.apply(pool, ws.orgId, {});
      assert.equal(again.already, true);
      assert.deepEqual(await seed.counts(pool, ws.orgId), after);

      const [p1, p2, p3] = r.projects;
      const status = async (id) => (await h.one(pool, 'SELECT status, hold_kind FROM org_sponsored_projects WHERE id = $1', [id]));
      assert.deepEqual(await status(p1), { status: 'active', hold_kind: null });
      assert.deepEqual(await status(p2), { status: 'on_hold', hold_kind: 'report_overdue' });
      assert.deepEqual(await status(p3), { status: 'on_hold', hold_kind: 'manual' });

      const { loadProjectBalance } = require('../../server/organizational/lib/sponsorBalance');
      const b1 = (await loadProjectBalance(pool, ws.orgId, p1)).balance;
      assert.equal(b1.received_posted_cents, 3300000);
      assert.equal(b1.disbursed_posted_cents, 180000);
      assert.ok(b1.pending_cents >= 250000 + 750000 + 100000, 'approved payments, the payment waiting for its second approval and the recall are committed');
      assert.ok(b1.received_unposted_cents >= 150000, 'the card gift not yet in the books is shown apart');

      const { previewFees } = require('../../server/organizational/lib/sponsorFeePosting');
      const preview = await previewFees(pool, ws.orgId, new Date().toISOString().slice(0, 10));
      assert.ok(preview.rows.some((x) => x.project_id === p1 && x.due_cents > 0), 'project 1 has fees due in the Accounting preview');
      assert.ok(preview.rows.filter((x) => x.project_id === p1).every((x) => x.exempt_cents === 0 || x.exempt_cents === 800000), 'the exempt gift is left out of the fee');

      const { loadOverview } = require('../../server/organizational/lib/sponsorOverview');
      const ov = await loadOverview(pool, ws.orgId);
      const row = (id) => ov.projects.find((p) => p.id === id);
      assert.equal(row(p1).attention, false);
      assert.equal(row(p2).flags.hold, true);
      assert.equal(row(p3).flags.agreement_missing, true);
      assert.equal(ov.totals.attention_count, 2);

      const { fetchAttentionFeed } = require('../../server/organizational/lib/OrganizationalAttentionFeed');
      const feed = await fetchAttentionFeed(pool, ws.orgId, ws.slug);
      const items = (feed.items || feed).filter((i) => i.type === 'sponsored_project');
      assert.ok(items.some((i) => /Sample project 3.*no signed agreement/.test(i.title)));
      assert.ok(items.some((i) => /Sample project 2.*on hold/.test(i.title)));

      const pending = await h.one(pool, `SELECT count(*)::int AS n FROM org_gifts WHERE org_id = $1 AND posting_status = 'unposted' AND sponsored_project_id = $2`, [ws.orgId, p1]);
      assert.equal(pending.n, 2, 'the grant and the donated tools wait in Gift Postings');

      await asOwner();
      const removed = await seed.remove(pool, ws.orgId);
      assert.equal(removed.removed, true);
      assert.deepEqual(await seed.counts(pool, ws.orgId), ZERO);
      const left = await h.one(pool, `SELECT
          (SELECT count(*)::int FROM org_ledger_transactions WHERE org_id = $1) AS ledger,
          (SELECT count(*)::int FROM org_programs WHERE org_id = $1 AND description LIKE '%seed:%') AS programs,
          (SELECT count(*)::int FROM org_accounts WHERE org_id = $1 AND description LIKE '%seed:%') AS accounts,
          (SELECT count(*)::int FROM org_grants WHERE org_id = $1) AS grants`, [ws.orgId]);
      assert.deepEqual(left, { ledger: 0, programs: 0, accounts: 0, grants: 0 });
      const s = await h.one(pool, 'SELECT fee_income_account_id, fee_expense_account_id FROM org_sponsor_settings WHERE org_id = $1', [ws.orgId]);
      assert.deepEqual([s.fee_income_account_id, s.fee_expense_account_id], [ws.accounts.feeIncome, ws.accounts.feeExpense]);
      assert.equal((await seed.remove(pool, ws.orgId)).removed, false);
    });
  } finally {
    docs.setPdfRenderer(null);
  }
});
