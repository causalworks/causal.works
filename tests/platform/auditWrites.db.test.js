'use strict';
// Audit entries written by bank rules and export-and-delete routes.
// Needs TEST_DATABASE_URL (see tests/sponsorship/helpers.js); runs in a rolled-back transaction.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };

async function logRows(pool, ws, table) {
  return (await pool.query(`SELECT action, field_name, old_value, new_value, record_id, metadata FROM org_audit_log WHERE org_id = $1 AND table_name = $2 ORDER BY id`, [ws.orgId, table])).rows;
}

test('bank rule create, change and delete are logged', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const api = h.loadRoutes('routes/bankRules.js', 'registerBankRuleRoutes', pool);
    const admin = ws.users.find((u) => u.role === 'admin');
    const base = { params: { slug: ws.slug }, user: admin.id, role: 'admin', orgId: ws.orgId, permissions: ['accounting_write'] };
    const created = await api.call('POST', '/api/organizational/orgs/:slug/bank-rules', { ...base, body: {
      name: 'Rent', payee_contains: 'landlord', direction: 'debit', action_account_id: ws.accounts.projectExpense, action_program_id: ws.programs.admin } });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    const id = created.body.id;
    const rp = { ...base, params: { slug: ws.slug, id: String(id) } };
    const patched = await api.call('PATCH', '/api/organizational/orgs/:slug/bank-rules/:id', { ...rp, body: { name: 'Office rent' } });
    assert.equal(patched.statusCode, 200, JSON.stringify(patched.body));
    const deleted = await api.call('DELETE', '/api/organizational/orgs/:slug/bank-rules/:id', rp);
    assert.equal(deleted.statusCode, 200, JSON.stringify(deleted.body));
    const rows = await logRows(pool, ws, 'org_bank_rules');
    assert.deepEqual(rows.map((r) => r.action), ['db_insert', 'db_update', 'db_delete']);
    assert.equal(JSON.parse(rows[1].old_value).name, 'Rent');
    assert.equal(JSON.parse(rows[1].new_value).name, 'Office rent');
  });
});

test('export-and-delete of grants is logged with the deleted count', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const api = h.loadRoutes('routes/imports.js', 'registerOrganizationalImportRoutes', pool);
    const admin = ws.users.find((u) => u.role === 'admin');
    await pool.query(`INSERT INTO org_grants (org_id, grant_code, name, funder, status, amount_cents) VALUES ($1, 'G1', 'Grant one', 'Funder', 'prospect', 1000)`, [ws.orgId]);
    const res = await api.call('POST', '/api/organizational/orgs/:slug/export-and-delete/grants', { params: { slug: ws.slug }, user: admin.id, role: 'admin', orgId: ws.orgId });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    const rows = await logRows(pool, ws, 'org_import_history');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'delete');
    assert.equal(rows[0].metadata.import_kind, 'export_delete_grants');
    assert.equal(rows[0].metadata.deleted, 1);
  });
});

test('trigger leaves secrets out and skips unchanged updates', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const r = await pool.query(`INSERT INTO org_plaid_items (org_id, item_id, access_token, institution_name) VALUES ($1, 'item-x', 'secret-token', 'Bank') RETURNING id`, [ws.orgId]);
    await pool.query(`UPDATE org_plaid_items SET cursor = 'c1' WHERE id = $1`, [r.rows[0].id]);
    await pool.query(`UPDATE org_plaid_items SET status = 'error' WHERE id = $1`, [r.rows[0].id]);
    const rows = await logRows(pool, ws, 'org_plaid_items');
    assert.deepEqual(rows.map((x) => x.action), ['db_insert', 'db_update']);
    for (const x of rows) assert.ok(!/secret-token|access_token|cursor/.test(`${x.old_value}${x.new_value}`));
    assert.equal(JSON.parse(rows[1].new_value).status, 'error');
  });
});

test('org profile settings, name, roles, invites and onboarding changes are logged', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const orgs = h.loadRoutes('routes/orgs.js', 'registerOrganizationalOrgRoutes', pool);
    const onboarding = h.loadRoutes('routes/onboarding.js', 'registerOrganizationalOnboardingRoutes', pool);
    const admin = ws.users.find((u) => u.role === 'admin');
    const other = ws.users.find((u) => u.role !== 'admin');
    const base = { params: { slug: ws.slug }, user: admin.id, role: 'admin', orgId: ws.orgId, permissions: ['admin'] };

    const before = (await pool.query(`SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1`, [ws.orgId])).rows[0].fiscal_year_end_month;
    const month = before === 6 ? 9 : 6;
    const patched = await orgs.call('PATCH', '/api/organizational/orgs/:slug', { ...base, body: { fiscal_year_end_month: month, entity_classification: '501(c)(3)', acknowledgment_signoff: 'Thank you' } });
    assert.equal(patched.statusCode, 200, JSON.stringify(patched.body));
    const settings = await logRows(pool, ws, 'org_settings');
    const byField = Object.fromEntries(settings.filter((r) => r.action === 'update').map((r) => [r.field_name, r]));
    assert.equal(byField.fiscal_year_end_month.new_value, String(month));
    assert.equal(byField.fiscal_year_end_month.old_value, before == null ? null : String(before));
    assert.equal(byField.entity_classification.new_value, '501(c)(3)');
    assert.equal(byField.acknowledgment_signoff.new_value, 'Thank you');
    assert.ok(!byField.ein, 'unchanged fields are not logged');

    const again = await orgs.call('PATCH', '/api/organizational/orgs/:slug', { ...base, body: { fiscal_year_end_month: month } });
    assert.equal(again.statusCode, 200);
    assert.equal((await logRows(pool, ws, 'org_settings')).length, settings.length, 'a save with no change writes nothing');

    const member = (await pool.query(`SELECT id, role FROM org_users WHERE org_id = $1 AND user_id = $2`, [ws.orgId, other.id])).rows[0];
    const newRole = member.role === 'finance' ? 'fundraising' : 'finance';
    const rolePatch = await orgs.call('PATCH', '/api/organizational/orgs/:slug/members/:id', { ...base, params: { slug: ws.slug, id: String(member.id) }, body: { role: newRole } });
    assert.equal(rolePatch.statusCode, 200, JSON.stringify(rolePatch.body));
    const roleRows = await logRows(pool, ws, 'org_users');
    assert.deepEqual(roleRows.map((r) => [r.action, r.field_name, r.old_value, r.new_value]), [['update', 'role', member.role, newRole]]);

    const removed = await orgs.call('DELETE', '/api/organizational/orgs/:slug/members/:id', { ...base, params: { slug: ws.slug, id: String(member.id) } });
    assert.equal(removed.statusCode, 200, JSON.stringify(removed.body));
    const afterRemove = await logRows(pool, ws, 'org_users');
    assert.equal(afterRemove[afterRemove.length - 1].action, 'delete');
    assert.equal(afterRemove[afterRemove.length - 1].metadata.role, newRole);

    const invite = await orgs.call('POST', '/api/organizational/orgs/:slug/invites', { ...base, body: { email: 'New.Person@example.org', role: 'finance' } });
    assert.equal(invite.statusCode, 200, JSON.stringify(invite.body));
    const cancel = await orgs.call('DELETE', '/api/organizational/orgs/:slug/invites/:id', { ...base, params: { slug: ws.slug, id: String(invite.body.invite.id) } });
    assert.equal(cancel.statusCode, 200);
    const inviteRows = await logRows(pool, ws, 'org_invites');
    assert.deepEqual(inviteRows.map((r) => r.action), ['create', 'delete']);
    assert.equal(inviteRows[0].metadata.email, 'new.person@example.org');
    assert.equal(inviteRows[0].metadata.role, 'finance');

    const step = await onboarding.call('PATCH', '/api/organizational/orgs/:slug/onboarding-step', { ...base, body: { step: 'programs' } });
    assert.equal(step.statusCode, 200, JSON.stringify(step.body));
    const blank = await onboarding.call('POST', '/api/organizational/orgs/:slug/onboarding/confirm-blank-coa', base);
    assert.equal(blank.statusCode, 200);
    const onboardingRows = (await logRows(pool, ws, 'org_settings')).filter((r) => /^onboarding_/.test(r.field_name));
    assert.deepEqual(onboardingRows.map((r) => r.field_name), ['onboarding_step', 'onboarding_blank_coa_chosen']);
    assert.equal(onboardingRows[0].new_value, 'programs');
  });
});

test('org create and org delete are logged', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const podFile = require.resolve('../../server/organizational/lib/podProvision');
    const podSaved = require.cache[podFile];
    require.cache[podFile] = { id: podFile, filename: podFile, loaded: true, exports: { provisionPodForOrg: async () => ({ ok: true }) } };
    let orgs;
    try { orgs = h.loadRoutes('routes/orgs.js', 'registerOrganizationalOrgRoutes', pool); } finally {
      if (podSaved) require.cache[podFile] = podSaved; else delete require.cache[podFile];
    }
    const admin = ws.users.find((u) => u.role === 'admin');

    const created = await orgs.call('POST', '/api/organizational/orgs', { user: admin.id, role: 'admin', body: { display_name: 'Audit Create Test Org', fiscal_year_end_month: 12 } });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    const newOrgId = created.body.org.id;
    const orgRows = (await pool.query(`SELECT action, record_id, user_id, metadata FROM org_audit_log WHERE org_id = $1 AND table_name = 'coop_members'`, [newOrgId])).rows;
    assert.deepEqual(orgRows.map((r) => r.action), ['create']);
    assert.equal(Number(orgRows[0].record_id), newOrgId);
    assert.equal(orgRows[0].user_id, admin.id);
    assert.equal(orgRows[0].metadata.display_name, 'Audit Create Test Org');
    const userRows = (await pool.query(`SELECT action, metadata FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_users'`, [newOrgId])).rows;
    assert.equal(userRows.length, 1);
    assert.equal(userRows[0].action, 'create');
    assert.equal(userRows[0].metadata.role, 'admin');
    assert.equal(userRows[0].metadata.reason, 'creator');

    const wrong = await orgs.call('DELETE', '/api/organizational/orgs/:slug', { params: { slug: created.body.org.slug }, user: admin.id, role: 'admin', orgId: newOrgId, body: { confirm_name: 'Something else' } });
    assert.equal(wrong.statusCode, 400);
    const none = (await pool.query(`SELECT count(*)::int AS n FROM org_audit_log WHERE org_id = $1 AND action = 'delete' AND table_name = 'coop_members'`, [newOrgId])).rows[0].n;
    assert.equal(none, 0, 'a refused delete writes nothing');

    const deleted = await orgs.call('DELETE', '/api/organizational/orgs/:slug', { params: { slug: created.body.org.slug }, user: admin.id, role: 'admin', orgId: newOrgId, body: { confirm_name: 'Audit Create Test Org' } });
    assert.equal(deleted.statusCode, 200, JSON.stringify(deleted.body));
    const delRows = (await pool.query(`SELECT action, metadata FROM org_audit_log WHERE org_id = $1 AND action = 'delete' AND table_name = 'coop_members'`, [newOrgId])).rows;
    assert.equal(delRows.length, 1);
    assert.equal(delRows[0].metadata.soft_delete, true);
    assert.equal(delRows[0].metadata.display_name, 'Audit Create Test Org');
  });
});

test('a failed audit write is recorded for the platform admin page; strict mode throws', opts, async () => {
  await h.withDb(async ({ pool, client }) => {
    const ws = await h.seedWorkspace(pool);
    const { logAudit } = require('../../server/organizational/lib/auditLog');
    await logAudit(pool, { orgId: ws.orgId, userId: null, action: 'create', metadata: {} });
    const rows = (await pool.query(`SELECT org_id, action, error, reviewed_at FROM platform_audit_failures WHERE org_id = $1`, [ws.orgId])).rows;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].action, 'create');
    assert.match(rows[0].error, /tableName/);
    assert.equal(rows[0].reviewed_at, null);
    await assert.rejects(() => logAudit(pool, { orgId: ws.orgId, userId: null, action: 'create', metadata: {}, strict: true }), /not written/);
    await assert.rejects(async () => {
      await client.query('SAVEPOINT s1');
      try { await logAudit(pool, { orgId: ws.orgId, userId: null, action: 'bogus', tableName: 'org_settings', recordId: ws.orgId, strict: true }); }
      finally { await client.query('ROLLBACK TO SAVEPOINT s1'); }
    });
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM platform_audit_failures WHERE org_id = $1`, [ws.orgId])).rows[0].n, 1, 'strict failures are thrown, not recorded');
  });
});
