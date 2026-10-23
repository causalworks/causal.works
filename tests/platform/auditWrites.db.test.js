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
