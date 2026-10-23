'use strict';
// Fiscal-year lock gate: refused while year-end checks fail, allowed with a written reason from an admin only, and logged.
// Needs TEST_DATABASE_URL (see tests/sponsorship/helpers.js); runs in a rolled-back transaction.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };
const LOCK = '/api/organizational/orgs/:slug/fiscal-years/:fy/lock';
const FY = 2026;

async function unbalance(pool, ws) {
  const t = await h.one(pool,
    `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source, entry_type)
     VALUES ($1, '2026-03-01', $2, 'One-sided', 'manual', 'receive') RETURNING id`, [ws.orgId, FY]);
  await pool.query(
    `INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents) VALUES ($1, $2, $3, 5000, 0)`,
    [t.id, ws.accounts.bank, ws.programs.admin]);
}

async function lockRow(pool, ws) {
  return h.one(pool, `SELECT locked_at, reopened_at FROM org_fiscal_year_locks WHERE org_id = $1 AND fiscal_year = $2`, [ws.orgId, FY]);
}

test('lock is refused while year-end checks fail unless an admin gives a reason, which is logged', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const api = h.loadRoutes('routes/fiscal-year-locks.js', 'registerFiscalYearLockRoutes', pool);
    const admin = ws.users.find((u) => u.role === 'admin');
    const finance = ws.users.find((u) => u.role === 'finance');
    const call = (u, body) => api.call('POST', LOCK, { params: { slug: ws.slug, fy: String(FY) }, body, user: u.id, role: u.role, orgId: ws.orgId });

    await unbalance(pool, ws);

    const noReason = await call(admin, {});
    assert.equal(noReason.statusCode, 409);
    assert.ok(noReason.body.failed_checks.some((c) => c.id === 'balance_sheet_ties'));
    const shortReason = await call(admin, { override_reason: 'too short' });
    assert.equal(shortReason.statusCode, 409);
    assert.equal(await lockRow(pool, ws), undefined);

    const financeWithReason = await call(finance, { override_reason: 'Auditor asked for the year to be closed' });
    assert.equal(financeWithReason.statusCode, 403);
    assert.equal(await lockRow(pool, ws), undefined);

    const adminWithReason = await call(admin, { override_reason: 'Auditor asked for the year to be closed' });
    assert.equal(adminWithReason.statusCode, 200);
    assert.ok((await lockRow(pool, ws)).locked_at);
    const log = await h.one(pool,
      `SELECT metadata FROM org_audit_log WHERE org_id = $1 AND table_name = 'org_fiscal_year_locks' ORDER BY id DESC LIMIT 1`, [ws.orgId]);
    assert.equal(log.metadata.override_reason, 'Auditor asked for the year to be closed');
    assert.ok(log.metadata.failed_checks.includes('balance_sheet_ties'));
  });
});

test('lock needs no reason when year-end checks pass', opts, async () => {
  await h.withDb(async ({ pool }) => {
    const ws = await h.seedWorkspace(pool);
    const api = h.loadRoutes('routes/fiscal-year-locks.js', 'registerFiscalYearLockRoutes', pool);
    const finance = ws.users.find((u) => u.role === 'finance');
    const r = await api.call('POST', LOCK, { params: { slug: ws.slug, fy: String(FY) }, body: {}, user: finance.id, role: 'finance', orgId: ws.orgId });
    assert.equal(r.statusCode, 200, JSON.stringify(r.body));
    assert.ok((await lockRow(pool, ws)).locked_at);
  });
});
