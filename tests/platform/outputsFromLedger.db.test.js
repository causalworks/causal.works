'use strict';
// Cash on hand, the cash forecast opening balance, board months of cash and the giving summary year end are read from the ledger and the fiscal year as booked.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');
const { ledgerCashCents } = require('../../server/organizational/lib/ledgerCash');
const { buildCashflowGrid } = require('../../server/organizational/lib/cashflowForecast');
const { runwayForOrg } = require('../../server/organizational/lib/OrganizationalFinanceSnapshot');

const opts = { skip: h.SKIP };

async function post(pool, ws, date, cents) {
  const t = await h.one(pool, `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source, entry_type) VALUES ($1, $2, $3, 'Gift', 'manual', 'receive') RETURNING id`,
    [ws.orgId, date, Number(date.slice(0, 4))]);
  await pool.query(`INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, debit_cents, credit_cents) VALUES ($1, $2, $3, $4, 0), ($1, $5, $3, 0, $4)`,
    [t.id, ws.accounts.bank, ws.programs.admin, cents, ws.accounts.contributions]);
}

test('cash on hand and the forecast opening balance come from the ledger, not a stored snapshot or typed value', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    await post(pool, ws, '2026-03-10', 500000);
    await post(pool, ws, '2026-09-20', 250000);
    await pool.query(`UPDATE org_settings SET org_profile_data = '{"cash_balance_cents": 99999999, "runway_months": 40}' WHERE org_id = $1`, [ws.orgId]);
    await pool.query(`INSERT INTO org_balance_sheet_snapshots (org_id, coop_account_id, as_of_date, balance_cents) VALUES ($1, $2, '2025-12-31', 88888888)`, [ws.orgId, ws.accounts.bank]);
    await asApp(ws.orgId);
    assert.equal(await ledgerCashCents(pool, ws.orgId, { before: '2026-09-01' }), 500000);
    assert.equal(await ledgerCashCents(pool, ws.orgId, { through: '2026-09-20' }), 750000);
    const grid = await buildCashflowGrid(pool, { orgId: ws.orgId, startDate: new Date('2026-10-01T00:00:00'), monthsAhead: 3 });
    assert.equal(grid.cash.opening_cents, 750000);
    const runway = await runwayForOrg(pool, ws.orgId, { cash_balance_cents: 99999999, runway_months: 40 });
    assert.equal(runway.months, null);
    assert.equal(runway.cash_balance_cents, 750000);
  });
});

test('giving summary for a fiscal year includes gifts received during its last day', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const ws = await h.seedWorkspace(pool);
    const ins = (at, cents) => pool.query(`INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at) VALUES ($1, 'donation', $2, $3)`, [ws.orgId, cents, at]);
    await ins('2026-12-31T15:00:00Z', 1000);
    await ins('2026-06-01T10:00:00Z', 2000);
    await ins('2027-01-01T00:30:00Z', 4000);
    await asApp(ws.orgId);
    const api = h.loadRoutes('routes/donors.js', 'registerOrganizationalDonorRoutes', pool);
    const res = await api.call('GET', '/api/organizational/orgs/:slug/giving-summary', { params: { slug: ws.slug }, query: { fiscal_year: '2026' }, user: ws.users[0].id, role: 'admin', orgId: ws.orgId, permissions: ['admin'] });
    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(res.body.received_cents, 3000);
  });
});
