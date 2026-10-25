'use strict';

// Test helpers for Sponsorship: a throwaway-database harness (one transaction per test, rolled back),
// seed rows, and a fake app that records route handlers so they can be called directly.

const path = require('path');
const Module = require('module');

process.env.PUBLIC_FORM_SECRET = process.env.PUBLIC_FORM_SECRET || 'test-form-secret';
const DB_URL = process.env.TEST_DATABASE_URL || '';
const SKIP = DB_URL ? false : 'Set TEST_DATABASE_URL to a throwaway database built from build-specs/schema.sql (see build-specs/README.md).';

let pg = null;
function pgModule() {
  if (!pg) {
    pg = require('pg');
    pg.types.setTypeParser(1082, (v) => v);
  }
  return pg;
}

// A pool stand-in over one client inside one transaction. connect() hands out the same client with
// BEGIN/COMMIT/ROLLBACK mapped to savepoints, so library code that opens its own transactions still works.
function txPool(client) {
  let n = 0;
  const stack = [];
  const wrapped = {
    async query(text, params) {
      if (typeof text === 'string') {
        if (/^\s*BEGIN\b/i.test(text)) { const sp = 'sp' + (++n); stack.push(sp); return client.query('SAVEPOINT ' + sp); }
        if (/^\s*COMMIT\b/i.test(text)) { const sp = stack.pop(); return sp ? client.query('RELEASE SAVEPOINT ' + sp) : { rows: [] }; }
        if (/^\s*ROLLBACK\b/i.test(text)) { const sp = stack.pop(); return sp ? client.query('ROLLBACK TO SAVEPOINT ' + sp) : { rows: [] }; }
      }
      return client.query(text, params);
    },
    release() {},
  };
  return { query: (t, p) => wrapped.query(t, p), connect: async () => wrapped };
}

async function withDb(fn) {
  const { Client } = pgModule();
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  try {
    await client.query('BEGIN');

    const pool = txPool(client);
    const ctx = { client, pool };
    ctx.asApp = async (orgId, programIds) => {
      await client.query('SET LOCAL ROLE causal_app');
      await client.query("SELECT set_config('app.current_org_id', $1, true)", [String(orgId)]);
      await client.query("SELECT set_config('app.current_program_ids', $1, true)", [programIds == null ? '*' : programIds.join(',')]);
    };
    ctx.asOwner = async () => { await client.query('RESET ROLE'); };
    await fn(ctx);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

async function one(pool, sql, params) {
  const r = await pool.query(sql, params);
  return r.rows[0];
}

// Seed a fiscal-sponsor workspace with the accounts and programs the sponsorship code needs.
async function seedWorkspace(pool, opts) {
  const o = opts || {};
  const org = await one(pool, `INSERT INTO coop_members (display_name, slug) VALUES ('Sponsor workspace ' || floor(random() * 1e9)::text, 'sponsor-' || floor(random() * 1e9)::text) RETURNING id, slug`);
  const orgId = org.id;
  await pool.query(`INSERT INTO org_settings (org_id, fiscal_year_end_month, fiscal_sponsorship_mode) VALUES ($1, $2, true)`, [orgId, o.fyEndMonth || 12]);
  const users = [];
  for (const role of ['admin', 'finance', 'board', 'program', 'finance']) {
    const u = await one(pool, `INSERT INTO users (email, forwarding_address) VALUES ($1, $1) RETURNING id`, [role + '-' + Math.floor(Math.random() * 1e9) + '@example.test']);
    const ou = await one(pool, `INSERT INTO org_users (org_id, user_id, role) VALUES ($1, $2, $3::org_member_role) RETURNING id`, [orgId, u.id, role]);
    users.push({ id: u.id, orgUserId: ou.id, role });
  }
  const acct = async (code, name, type, extra) => (await one(pool,
    `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, is_cash_account, standard_category)
     VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5, $6) RETURNING id`,
    [orgId, code, name, type, !!(extra && extra.cash), (extra && extra.category) || null])).id;
  const accounts = {
    bank: await acct('1000', 'Operating bank', 'asset', { cash: true }),
    contributions: await acct('4000', 'Contributions', 'income', { category: 'REV_CONTRIB' }),
    feeIncome: await acct('4900', 'Administrative fee income', 'income'),
    feeExpense: await acct('6900', 'Administrative fee charged', 'expense'),
    projectExpense: await acct('6100', 'Project expenses', 'expense'),
  };
  const prog = async (name) => (await one(pool, `INSERT INTO org_programs (org_id, name) VALUES ($1, $2) RETURNING id`, [orgId, name])).id;
  const programs = { admin: await prog('Administration'), projectA: await prog('Project A'), projectB: await prog('Project B') };
  await pool.query(
    `INSERT INTO org_sponsor_settings (org_id, fee_income_account_id, fee_expense_account_id, fee_income_program_id, untagged_review_from)
     VALUES ($1, $2, $3, $4, now() - interval '1 day')`,
    [orgId, accounts.feeIncome, accounts.feeExpense, programs.admin]);
  return { orgId, slug: org.slug, users, accounts, programs };
}

async function seedProject(pool, ws, opts) {
  const o = opts || {};
  const p = await one(pool,
    `INSERT INTO org_sponsored_projects (sponsor_org_id, name, status, program_id, start_date, sponsorship_model, admin_rate, disbursement_expense_account_id)
     VALUES ($1, $2, 'active', $3, $4, $5, $6, $7) RETURNING *`,
    [ws.orgId, o.name || 'Project A', o.programId !== undefined ? o.programId : ws.programs.projectA, o.startDate || '2026-01-01',
     o.model || 'model_a', o.adminRate != null ? o.adminRate : null, ws.accounts.projectExpense]);
  if (o.rule !== false) {
    const r = o.rule || { kind: 'percent', rate: 6 };
    await pool.query(
      `INSERT INTO org_sponsor_fee_rules (org_id, sponsored_project_id, kind, rate, tiers, flat_cents, minimum_quarter_cents, effective_from)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [ws.orgId, p.id, r.kind, r.rate != null ? r.rate : null, r.tiers ? JSON.stringify(r.tiers) : null, r.flat_cents != null ? r.flat_cents : null,
       r.minimum_quarter_cents || 0, r.effective_from || o.startDate || '2026-01-01']);
  }
  return p;
}

// A cash gift tagged to a project, posted to the ledger as a bank receipt on the project's program.
async function seedPostedGift(pool, ws, project, cents, date, opts) {
  const o = opts || {};
  const t = await one(pool,
    `INSERT INTO org_ledger_transactions (org_id, transaction_date, fiscal_year, memo, source, entry_type)
     VALUES ($1, $2, $3, 'Gift', 'manual', 'receive') RETURNING id`, [ws.orgId, date, Number(String(date).slice(0, 4))]);
  await pool.query(
    `INSERT INTO org_ledger_lines (transaction_id, account_id, program_id, donor_restriction_class, debit_cents, credit_cents) VALUES
       ($1, $2, $3, 'temporarily_restricted', $4, 0), ($1, $5, $3, 'temporarily_restricted', 0, $4)`,
    [t.id, ws.accounts.bank, project.program_id, cents, ws.accounts.contributions]);
  const g = await one(pool,
    `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, posting_status, ledger_transaction_id, program_id, sponsor_fee_exempt)
     VALUES ($1, 'donation', $2, $3, $4, 'posted', $5, $6, $7) RETURNING id`,
    [ws.orgId, cents, date, project.id, t.id, project.program_id, !!o.exempt]);
  return { giftId: g.id, transactionId: t.id };
}

async function seedUnpostedGift(pool, ws, project, cents, date) {
  const g = await one(pool,
    `INSERT INTO org_gifts (org_id, gift_type, amount_cents, received_at, sponsored_project_id, posting_status)
     VALUES ($1, 'donation', $2, $3, $4, 'not_applicable') RETURNING id`, [ws.orgId, cents, date, project ? project.id : null]);
  return g.id;
}

// Load a route module with the sign-in and workspace middleware replaced, so handlers run against a test context.
function loadRoutes(relPath, registerName, pool) {
  const serverDir = path.join(__dirname, '..', '..', 'server');
  const stubs = {
    [path.join(serverDir, 'auth.js')]: { requireAuth: () => function requireAuth(req, res, next) { next(); } },
    [path.join(serverDir, 'organizational', 'middleware', 'requireOrganizationalAccess.js')]: { requireOrganizationalAccess: function requireOrganizationalAccess(req, res, next) { next(); } },
  };
  const memb = require(path.join(serverDir, 'organizational', 'middleware', 'requireOrgMembership.js'));
  stubs[path.join(serverDir, 'organizational', 'middleware', 'requireOrgMembership.js')] = {
    ...memb,
    requireOrgMembership: () => function requireOrgMembership(req, res, next) { next(); },
  };
  const saved = {};
  for (const [file, exp] of Object.entries(stubs)) {
    saved[file] = require.cache[file];
    const m = new Module(file);
    m.filename = file;
    m.loaded = true;
    m.exports = exp;
    require.cache[file] = m;
  }
  const target = path.join(serverDir, 'organizational', relPath);
  delete require.cache[target];
  const routes = [];
  const app = {};
  ['get', 'post', 'put', 'patch', 'delete'].forEach((method) => {
    app[method] = (p, ...handlers) => routes.push({ method: method.toUpperCase(), path: p, handlers: handlers.flat(Infinity) });
  });
  try {
    require(target)[registerName](app, pool);
  } finally {
    for (const [file, mod] of Object.entries(saved)) {
      if (mod) require.cache[file] = mod; else delete require.cache[file];
    }
    delete require.cache[target];
  }
  return {
    routes,
    async call(method, routePath, { params, body, query, user, role, permissions, orgId, programIds, headers, file, ip }) {
      const route = routes.find((r) => r.method === method && r.path === routePath);
      if (!route) throw new Error('No route ' + method + ' ' + routePath);
      const req = {
        params: params || {}, body: body || {}, query: query || {}, headers: headers || {}, ip: ip || '127.0.0.1', get: () => null, file,
        user: { id: user, user_id: user }, orgId, coopOrgRole: role, accessPermissions: permissions || [], coopOrgProgramIds: programIds || [],
        coopOrgUserId: null,
      };
      const res = {
        statusCode: 200, body: undefined,
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; this.done = true; return this; },
        send(b) { this.body = b; this.done = true; return this; },
        set() { return this; }, setHeader() {}, type() { return this; }, sendFile(f) { this.body = f; this.done = true; return this; },
      };
      for (const h of route.handlers) {
        let nextCalled = false;
        await h(req, res, (err) => { if (err) throw err; nextCalled = true; });
        if (!nextCalled || res.done) break;
      }
      return res;
    },
  };
}

module.exports = { SKIP, withDb, txPool, one, seedWorkspace, seedProject, seedPostedGift, seedUnpostedGift, loadRoutes };
