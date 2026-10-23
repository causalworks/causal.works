'use strict';

// Who can open a sponsored project's files from the general Documents screen, and who may approve a request that came
// through a project link, against a throwaway database.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./helpers');
const money = require('../../server/organizational/lib/sponsorMoneyOut');

const opts = { skip: h.SKIP };
const D = '/api/organizational/orgs/:slug/documents';

async function addUser(pool, ws, role) {
  const u = await h.one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
  await pool.query(`INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role)`, [ws.orgId, u.id, role]);
  return u.id;
}

async function addDoc(pool, ws, title, projectId, type) {
  return (await h.one(pool,
    `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, visibility, sponsored_project_id, sponsor_doc_type)
     VALUES ($1, 'other', $2, 'a.pdf', 'x/a.pdf', 'application/pdf', 1, md5(random()::text), 'org_all', $3, $4) RETURNING id`, [ws.orgId, title, projectId, type || null])).id;
}

test('project files in the general Documents screen follow the sponsorship read rule and the program limit', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const a = await h.seedProject(pool, ws, { name: 'Project A', programId: ws.programs.projectA });
    const b = await h.seedProject(pool, ws, { name: 'Project B', programId: ws.programs.projectB });
    const fundraising = await addUser(pool, ws, 'fundraising');
    const docA = await addDoc(pool, ws, 'W-9 A', a.id, 'tax_form');
    const docB = await addDoc(pool, ws, 'W-9 B', b.id, 'tax_form');
    const plain = await addDoc(pool, ws, 'Bylaws', null);
    await asApp(ws.orgId);
    const r = h.loadRoutes('routes/documents.js', 'registerOrganizationalDocumentRoutes', pool);
    const ids = async (user, role, programIds) => (await r.call('GET', D, { user, role, orgId: ws.orgId, programIds, params: { slug: ws.slug } })).body.documents.map((d) => d.id).sort((x, y) => x - y);
    const both = [docA, docB, plain].sort((x, y) => x - y);

    assert.deepEqual(await ids(ws.users[0].id, 'admin'), both);
    assert.deepEqual(await ids(ws.users[1].id, 'finance'), both);
    assert.deepEqual(await ids(ws.users[2].id, 'board'), both);
    assert.deepEqual(await ids(ws.users[3].id, 'program', [ws.programs.projectB]), [docB, plain].sort((x, y) => x - y));
    assert.deepEqual(await ids(fundraising, 'fundraising'), [plain]);

    const open = async (user, role, id, programIds) => (await r.call('GET', D + '/:id/download', { user, role, orgId: ws.orgId, programIds, params: { slug: ws.slug, id: String(id) } })).statusCode;
    assert.equal(await open(ws.users[3].id, 'program', docA, [ws.programs.projectB]), 403);
    assert.equal(await open(fundraising, 'fundraising', docA), 403);
    assert.notEqual(await open(ws.users[3].id, 'program', docB, [ws.programs.projectB]), 403);
    assert.notEqual(await open(ws.users[1].id, 'finance', docA), 403);

    const retention = async (user, role, programIds) => {
      const res = await r.call('GET', D + '/retention', { user, role, orgId: ws.orgId, programIds, params: { slug: ws.slug } });
      return [...res.body.expiring_soon, ...res.body.expired, ...res.body.permanent].map((d) => d.id);
    };
    assert.ok(!(await retention(ws.users[3].id, 'program', [ws.programs.projectB])).includes(docA));
  });
});

test('a person who made a project link cannot approve a request that came through it', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const project = await h.seedProject(pool, ws, { rule: { kind: 'percent', rate: 0 } });
    await h.seedPostedGift(pool, ws, project, 100000, '2026-01-15');
    const payee = await h.one(pool, `INSERT INTO org_constituents (org_id, display_name, kind) VALUES ($1, 'Venue vendor', 'organization') RETURNING id`, [ws.orgId]);
    const link = await h.one(pool,
      `INSERT INTO org_public_links (org_id, purpose, sponsored_project_id, token_hash, expires_at, created_by)
       VALUES ($1, 'project_lead', $2, md5(random()::text), now() + interval '7 days', $3) RETURNING id`, [ws.orgId, project.id, ws.users[1].id]);
    await asApp(ws.orgId);
    const rq = await money.createRequest(pool, { orgId: ws.orgId, userId: null, projectId: project.id, linkRef: 'link:' + link.id,
      input: { payee_constituent_id: payee.id, amount_cents: 20000, purpose: 'Printing' } });
    assert.equal(rq.httpStatus, 201, JSON.stringify(rq.body));
    const review = (u) => money.reviewRequest(pool, { orgId: ws.orgId, userId: ws.users[u].id, role: 'finance', projectId: project.id, requestId: rq.body.request.id, action: 'approve' });
    let res = await review(1);
    assert.equal(res.httpStatus, 403);
    assert.equal(res.body.code, 'self_approval');
    res = await review(4);
    assert.equal(res.httpStatus, 200, JSON.stringify(res.body));
  });
});

test('attention feed: sponsored projects, dues members, claims and admin-only documents show only to people who may read them', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    await h.seedProject(pool, ws, { name: 'Feed project' });
    await pool.query(`UPDATE org_sponsored_projects SET status = 'on_hold', hold_reason = 'Review' WHERE sponsor_org_id = $1`, [ws.orgId]);
    await pool.query(
      `INSERT INTO org_documents (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, visibility, expiration_date, is_current, uploaded_by_user_id)
       VALUES ($1, 'other', 'Admin only paper', 'a.pdf', 'x/a.pdf', 'application/pdf', 1, 'abc', 'admins_only', current_date + 10, true, $2)`, [ws.orgId, ws.users[0].id]);
    const { fetchAttentionFeed } = require('../../server/organizational/lib/OrganizationalAttentionFeed');
    const as = (role, extra) => ({ coopOrgRole: role, accessPermissions: [], coopOrgProgramIds: [], user: { id: ws.users[0].id }, orgId: ws.orgId, ...(extra || {}) });
    const titles = async (req) => ((await fetchAttentionFeed(pool, ws.orgId, ws.slug, req)).items).map((i) => i.title).join('|');
    const admin = await titles(as('admin'));
    assert.match(admin, /Feed project/);
    assert.match(admin, /Admin only paper/);
    const fundraising = await titles(as('fundraising'));
    assert.doesNotMatch(fundraising, /Feed project/);
    assert.doesNotMatch(fundraising, /Admin only paper/);
    const otherLead = await titles(as('program', { coopOrgProgramIds: [ws.programs.projectB] }));
    assert.doesNotMatch(otherLead, /Feed project/);
    const ownLead = await titles(as('program', { coopOrgProgramIds: [ws.programs.projectA] }));
    assert.match(ownLead, /Feed project/);
  });
});
