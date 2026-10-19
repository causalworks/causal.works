'use strict';

// The Membership sample-data script against a throwaway database: apply, apply again (no change), the statuses it
// produces, and remove (back to the start).

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };
const seed = require('../../scripts/seed-membership-demo');
const M = require('../../server/organizational/lib/membership');

const ZERO = { tiers: 0, contacts: 0, terms: 0, payments: 0, seats: 0 };

test('membership seed: refuses a workspace without a program or bank account', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Empty workspace', 'empty-' || floor(random() * 1e9)::text) RETURNING id`);
    await pool.query('INSERT INTO org_settings (org_id) VALUES ($1)', [org.id]);
    const pre = await seed.prerequisites(pool, org.id);
    assert.ok(pre.problems.some((p) => /program/.test(p)));
    assert.ok(pre.problems.some((p) => /bank account/.test(p)));
  });
});

test('membership seed: apply creates the set, a second run changes nothing, statuses cover every case, remove clears it', opts, async () => {
  await h.withDb(async ({ pool, asApp, asOwner }) => {
    const ws = await h.seedWorkspace(pool);
    await asApp(ws.orgId);
    assert.deepEqual(await seed.counts(pool, ws.orgId), ZERO);

    const r = await seed.apply(pool, ws.orgId, {});
    assert.equal(r.created, true, JSON.stringify(r));
    const after = await seed.counts(pool, ws.orgId);
    assert.equal(after.tiers, 6);
    assert.equal(after.terms, 11);
    assert.equal(after.seats, 2);
    assert.equal(after.payments, 9);

    assert.equal((await seed.apply(pool, ws.orgId, {})).already, true);
    assert.deepEqual(await seed.counts(pool, ws.orgId), after);

    const list = await M.listDuesMembers(pool, ws.orgId, {});
    const rows = list.rows || list.dues_members || list;
    const byName = Object.fromEntries(rows.map((x) => [x.display_name, x.status]));
    assert.equal(byName['Dues member 1'], 'active');
    assert.equal(byName['Dues member 3'], 'grace');
    assert.equal(byName['Dues member 4'], 'lapsed');
    assert.equal(byName['Dues member 8'], 'ended');
    assert.equal(byName['Dues member 6'], 'pending');

    const unposted = await pool.query(`SELECT count(*)::int AS n FROM org_membership_payments WHERE org_id = $1 AND kind = 'payment' AND posting_status = 'unposted'`, [ws.orgId]);
    assert.equal(unposted.rows[0].n, 8);

    await asOwner();
    const gone = await seed.remove(pool, ws.orgId, {});
    assert.equal(gone.removed, true);
    assert.deepEqual(await seed.counts(pool, ws.orgId), ZERO);
  });
});
