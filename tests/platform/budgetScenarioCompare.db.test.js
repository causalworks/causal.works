'use strict';
// Budget scenario comparison and summary: each scenario shows only its own overrides, and baseline rows that differ only by activity are added up once.

const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../sponsorship/helpers');

const opts = { skip: h.SKIP };
const P = '/api/organizational/orgs/:slug/budget-scenarios/:id/';

test('a scenario does not pick up the lines of another scenario in the same organization', opts, async () => {
  await h.withDb(async ({ pool, asApp }) => {
    const org = await h.one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Scenario workspace', 'scn-' || floor(random() * 1e9)::text) RETURNING id, slug`);
    await pool.query('INSERT INTO org_settings (org_id, fiscal_year_end_month) VALUES ($1, 12)', [org.id]);
    const acct = async (code, type) => (await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level) VALUES ($1, $2, $2, $3::org_account_type, true, 3) RETURNING id`, [org.id, code, type])).id;
    const rev = await acct('4000', 'income');
    const exp = await acct('6000', 'expense');
    const stat = (await h.one(pool, `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_statistical) VALUES ($1, '9000', '9000', 'expense', true, 3, true) RETURNING id`, [org.id])).id;
    const prog = (await h.one(pool, `INSERT INTO org_programs (org_id, name) VALUES ($1, 'Program') RETURNING id`, [org.id])).id;
    const line = (account, month, cents) => pool.query(
      `INSERT INTO org_budget_lines (org_id, account_id, program_id, fiscal_year, month, amount_cents) VALUES ($1, $2, $3, 2026, $4, $5)`, [org.id, account, prog, month, cents]);
    await line(rev, 1, 100000);
    await line(exp, 1, 60000);
    await line(stat, 1, 5000);
    const scen = async (name) => (await h.one(pool, `INSERT INTO org_budget_scenarios (org_id, fiscal_year, name) VALUES ($1, 2026, $2) RETURNING id`, [org.id, name])).id;
    const a = await scen('A');
    const b = await scen('B');
    await pool.query(`INSERT INTO org_budget_scenario_lines (scenario_id, account_id, program_id, month, amount_cents) VALUES ($1, $2, $3, 1, 70000)`, [a, exp, prog]);
    await pool.query(`INSERT INTO org_budget_scenario_lines (scenario_id, account_id, program_id, month, amount_cents) VALUES ($1, $2, $3, 2, 90000)`, [b, exp, prog]);
    await asApp(org.id);
    const r = h.loadRoutes('routes/budgetScenarios.js', 'registerBudgetScenarioRoutes', pool);
    const call = (id, part) => r.call('GET', P + part, { params: { slug: org.slug, id: String(id) }, user: 1, role: 'admin', orgId: org.id });
    const cmp = (await call(a, 'compare')).body;
    assert.equal(cmp.rows.reduce((n, x) => n + x.scenario_amount_cents, 0), 100000 + 70000 + 5000);
    assert.equal(cmp.rows.filter((x) => x.overridden).length, 1);
    const sum = (await call(a, 'summary')).body;
    assert.equal(sum.totals.baseline_expense_cents, 60000);
    assert.equal(sum.totals.scenario_expense_cents, 70000);
    assert.equal(sum.totals.scenario_revenue_cents, 100000);
  });
});
