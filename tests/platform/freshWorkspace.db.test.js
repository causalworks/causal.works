'use strict';
// Fresh workspace as the real app database role: create a workspace through the route, post one ledger entry,
// and check that another workspace's context cannot see it. Needs SMOKE_DATABASE_URL (the restricted app role,
// on a throwaway database); leaves its rows behind.

const test = require('node:test');
const assert = require('node:assert');
const { loadRoutes } = require('../sponsorship/helpers');
const { wrapPoolWithOrgScoping } = require('../../server/organizational/lib/scopedPool');
const { requestContextMiddleware, enterOrgContext } = require('../../server/organizational/lib/orgContext');
const { postLedgerTransaction } = require('../../server/organizational/lib/ledgerPosting');

const URL = process.env.SMOKE_DATABASE_URL || '';
const SKIP = URL ? false : 'Set SMOKE_DATABASE_URL to the app-role connection of a throwaway database.';

function inContext(fn) {
  return new Promise((resolve, reject) => {
    requestContextMiddleware({}, {}, () => { fn().then(resolve, reject); });
  });
}

test('a new workspace can be created and used as the restricted app role', { skip: SKIP }, async () => {
  const pg = require('pg');
  pg.types.setTypeParser(1082, (v) => v);
  const pool = new pg.Pool({ connectionString: URL, max: 4 });
  try {
    const me = (await pool.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user')).rows[0];
    assert.equal(me.rolsuper || me.rolbypassrls, false, 'must run as a role that row-level security applies to');

    const scoped = wrapPoolWithOrgScoping(pool);
    const stamp = Date.now();
    const user = (await pool.query('INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id', [`smoke-${stamp}@example.test`])).rows[0];

    const created = await inContext(async () => {
      const app = loadRoutes('routes/orgs.js', 'registerOrganizationalOrgRoutes', scoped);
      return app.call('POST', '/api/organizational/orgs', {
        user: user.id, body: { display_name: `Smoke ${stamp}`, fiscal_year_end_month: 12 },
      });
    });
    assert.equal(created.statusCode, 201, JSON.stringify(created.body));
    const orgId = created.body.org.id;

    await inContext(async () => {
      enterOrgContext(orgId);
      const programs = (await scoped.query('SELECT id FROM org_programs WHERE org_id = $1 ORDER BY id', [orgId])).rows;
      assert.ok(programs.length >= 2, 'default programs exist');
      const acct = async (code, name, type, cash) => (await scoped.query(
        `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account)
         VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`, [orgId, code, name, type, cash])).rows[0].id;
      const bank = await acct('1000', 'Bank', 'asset', true);
      const income = await acct('4000', 'Contributions', 'income', false);
      const posted = await postLedgerTransaction(scoped, {
        orgId, userId: user.id, transactionDate: '2026-03-01', memo: 'Smoke gift', source: 'manual', internalApproval: null,
        lines: [
          { account_id: bank, program_id: programs[0].id, debit_cents: 5000 },
          { account_id: income, program_id: programs[0].id, credit_cents: 5000 },
        ],
      });
      assert.equal(posted.httpStatus, 201, JSON.stringify(posted.body));
      const mine = await scoped.query('SELECT count(*)::int AS n FROM org_ledger_lines l JOIN org_ledger_transactions t ON t.id = l.transaction_id WHERE t.org_id = $1', [orgId]);
      assert.equal(mine.rows[0].n, 2);
    });

    await inContext(async () => {
      enterOrgContext(orgId + 1000000);
      const other = await scoped.query('SELECT count(*)::int AS n FROM org_ledger_transactions');
      assert.equal(other.rows[0].n, 0, 'another workspace context sees none of it');
    });
  } finally {
    await pool.end();
  }
});
