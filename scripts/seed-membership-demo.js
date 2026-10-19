#!/usr/bin/env node
/* Sample data for the Membership screens: tiers, dues members in every status, payments left for Accounting,
   a waiver waiting for approval, an organization with seats, directory opt-ins and an extension, all made through
   the same route handlers the screens use.

   node scripts/seed-membership-demo.js --org <id>                 dry run: checks the workspace and lists what it would create
   node scripts/seed-membership-demo.js --org <id> --apply         creates it (a second run changes nothing)
   node scripts/seed-membership-demo.js --org <id> --remove        deletes only what this script created
   Options: --user <email> to act as that workspace user (default: a finance user, else an admin).
   Every row carries the marker seed:membership-demo. Nothing is sent by email. */
'use strict';

const path = require('path');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
const ORG = path.join(SERVER, 'organizational');
const lib = (name) => require(path.join(ORG, 'lib', name));

const MARKER = 'seed:membership-demo';
const NOTE = 'Sample data (' + MARKER + ')';
const P = '/api/organizational/orgs/:slug/membership';

function isoDay(d) { return d.toISOString().slice(0, 10); }
function dayOffset(today, n) { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }

function routeCaller(pool, { slug, user }) {
  const authFile = path.join(SERVER, 'auth.js');
  const realAuth = require(authFile);
  const saved = require.cache[authFile];
  const stub = new Module(authFile);
  stub.filename = authFile;
  stub.loaded = true;
  stub.exports = { ...realAuth, requireAuth: () => function signedInBySeed(req, res, next) { next(); } };
  require.cache[authFile] = stub;
  const routes = [];
  const app = {};
  ['get', 'post', 'put', 'patch', 'delete'].forEach((m) => { app[m] = (p, ...h) => routes.push({ method: m.toUpperCase(), path: p, handlers: h.flat(Infinity) }); });
  try {
    const target = path.join(ORG, 'routes', 'membership.js');
    delete require.cache[target];
    require(target).registerMembershipRoutes(app, pool);
    delete require.cache[target];
  } finally {
    if (saved) require.cache[authFile] = saved; else delete require.cache[authFile];
  }
  return async function call(method, routePath, opts) {
    const o = opts || {};
    const route = routes.find((r) => r.method === method && r.path === P + routePath);
    if (!route) throw new Error('No route ' + method + ' ' + routePath);
    const req = {
      params: { slug, ...(o.params || {}) }, body: o.body || {}, query: o.query || {}, headers: {}, cookies: {}, ip: '127.0.0.1',
      get: () => null, user: { id: user, user_id: user, coop_access: true },
    };
    const res = {
      statusCode: 200, body: undefined, done: false,
      status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; this.done = true; return this; },
      send(b) { this.body = b; this.done = true; return this; }, set() { return this; }, setHeader() {}, type() { return this; }, end() { this.done = true; return this; },
    };
    for (const h of route.handlers) {
      let nextCalled = false;
      await h(req, res, (err) => { if (err) throw err; nextCalled = true; });
      if (!nextCalled || res.done) break;
    }
    if (res.statusCode >= 400) throw new Error(method + ' ' + routePath + ' refused: ' + ((res.body && res.body.error) || res.statusCode));
    return res.body;
  };
}

async function workspace(pool, orgId) {
  const r = await pool.query('SELECT id, slug, display_name FROM coop_members WHERE id = $1', [orgId]);
  return r.rows[0] || null;
}

async function findActor(pool, orgId, email) {
  const r = await pool.query(
    `SELECT u.id AS user_id, ou.id AS org_user_id, ou.role::text AS role, u.email FROM org_users ou JOIN users u ON u.id = ou.user_id
      WHERE ou.org_id = $1 ${email ? 'AND lower(u.email) = lower($2)' : "AND ou.role::text IN ('finance', 'admin')"}
      ORDER BY (ou.role::text = 'finance') DESC, ou.id LIMIT 1`, email ? [orgId, email] : [orgId]);
  return r.rows[0] || null;
}

async function alreadySeeded(pool, orgId) {
  const r = await pool.query(`SELECT id, name FROM org_membership_tiers WHERE org_id = $1 AND description LIKE $2 ORDER BY id`, [orgId, '%' + MARKER + '%']);
  return r.rows;
}

async function prerequisites(pool, orgId, opts) {
  const problems = [];
  const ws = await workspace(pool, orgId);
  if (!ws) return { problems: ['There is no workspace with id ' + orgId + '.'] };
  const actor = await findActor(pool, orgId, opts && opts.userEmail);
  if (!actor) problems.push(opts && opts.userEmail ? 'That person is not a user of this workspace.' : 'Add a finance or admin user to this workspace first.');
  else if (!['finance', 'admin'].includes(actor.role)) problems.push('Act as a finance or admin user (--user).');
  const program = (await pool.query(`SELECT id, name FROM org_programs WHERE org_id = $1 AND active AND parent_id IS NULL AND NOT is_system_transfer_program ORDER BY is_default DESC, id LIMIT 1`, [orgId])).rows[0];
  if (!program) problems.push('Add at least one program first (Settings, Structure).');
  const bank = (await pool.query(`SELECT id FROM org_accounts WHERE org_id = $1 AND is_cash_account AND is_posting AND archived_at IS NULL ORDER BY id LIMIT 1`, [orgId])).rows[0];
  if (!bank) problems.push('Add a bank account to the chart of accounts first (Accounting, Banking).');
  return { problems, ws, actor, program, bank };
}

function plan() {
  return [
    'Accounts if missing (marked): deferred membership dues (liability), membership dues (income), contributions above the value of benefits (income).',
    'Membership settings if not saved: rolling 12-month terms, 30 days grace, 60-day renewal window, dues spread over the term, directory on with name, tier and website; the join form stays off.',
    'Tiers: Individual (200), Community pay what you can (minimum 0), Student or retiree (30), People affected (free), Organization small (125, 2 seats), Organization large (1,000 with 800 benefit value, 5 seats).',
    'Dues members (contacts named by role, marked in their notes): 9 individuals and 2 organizations in every status - active (paid, part-paid, free), pending first payment, in grace, lapsed, ended by staff, renewing within 30 days, one extended for hardship.',
    'Payments left unposted so they appear in Accounting, Dues Postings; a waiver waiting for a second person to approve; a discount with a reason; a payment with a contribution part.',
    'Seats on the small organization (2 people); directory opt-ins (public and private).',
    'Nothing is emailed and the public join form is not opened.',
  ];
}

async function apply(pool, orgId, opts) {
  const log = (opts && opts.log) || (() => {});
  if ((await alreadySeeded(pool, orgId)).length) return { already: true };
  const pre = await prerequisites(pool, orgId, opts && { userEmail: opts.userEmail });
  if (pre.problems.length) return { refused: true, problems: pre.problems };
  const { ws, actor, program } = pre;
  const userId = actor.user_id;
  const call = routeCaller(pool, { slug: ws.slug, user: userId });
  const { logAudit } = lib('auditLog');
  const q = (sql, params) => pool.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const today = isoDay(new Date());

  const account = async (type, where, code, name) => {
    const found = await one(`SELECT id FROM org_accounts WHERE org_id = $1 AND type = $2::org_account_type AND is_posting AND archived_at IS NULL AND ${where} ORDER BY id LIMIT 1`, [orgId, type]);
    if (found) return Number(found.id);
    let c = Number(code);
    while (await one('SELECT 1 FROM org_accounts WHERE org_id = $1 AND code = $2', [orgId, String(c)])) c += 1;
    const r = await one(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, description) VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5) RETURNING id`,
      [orgId, String(c), name, type, NOTE]);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_accounts', recordId: r.id, metadata: { seed: MARKER } });
    return Number(r.id);
  };
  const deferred = await account('liability', "name ~* 'deferred.*(dues|member)'", 2290, 'Deferred membership dues');
  const duesRev = await account('income', "name ~* 'membership dues|dues'", 4290, 'Membership dues');
  const contribRev = await account('income', "name ~* 'above.*benefit|membership contribution'", 4291, 'Contributions above the value of benefits');
  log('Accounts ready.');

  const before = await one('SELECT * FROM org_membership_settings WHERE org_id = $1', [orgId]);
  if (!before) {
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_membership_settings', recordId: orgId, metadata: { seed: MARKER, previous: { existed: false } } });
    await call('PUT', '/settings', { body: {
      year_mode: 'rolling', proration_mode: 'none', grace_days: 30, renewal_window_days: 60, recognition_mode: 'spread',
      deferred_dues_account_id: deferred, contribution_account_id: contribRev, dues_revenue_account_id: duesRev,
      default_program_id: Number(program.id), directory_enabled: true, directory_fields: ['name', 'tier', 'website'],
    } });
  }
  log('Settings ready.');

  const tier = async (body) => {
    const r = await call('POST', '/tiers', { body: { revenue_account_id: duesRev, program_id: Number(program.id), ...body, description: body.description + ' ' + NOTE, effective_on: dayOffset(today, -400) } });
    return r.tier.id;
  };
  const T = {
    individual: await tier({ name: 'Individual', description: 'General individual dues.', applies_to: 'individual', price: 200, benefits: ['Member directory listing', 'Member-only resources'] }),
    community: await tier({ name: 'Community (pay what you can)', description: 'Low-cost rate with a stated minimum.', applies_to: 'individual', price: 50, pay_what_you_can: true, min_price: 0, suggested_price: 50, benefits: ['Member directory listing'] }),
    student: await tier({ name: 'Student or retiree', description: 'Reduced rate.', applies_to: 'individual', price: 30, benefits: ['Member-only resources'] }),
    affected: await tier({ name: 'People directly affected', description: 'Free tier.', applies_to: 'individual', price: 0, benefits: ['Member-only resources'] }),
    orgSmall: await tier({ name: 'Organization (small)', description: 'For organizations with a small budget.', applies_to: 'organization', price: 125, seats_included: 2, budget_high: 250000, benefits: ['Member directory listing', 'Two seats'] }),
    orgLarge: await tier({ name: 'Organization (large)', description: 'Suggested dues by budget size; part is a contribution.', applies_to: 'organization', price: 1000, benefit_value: 800, seats_included: 5, budget_low: 250001, benefits: ['Member directory listing', 'Five seats', 'Listing in the public directory'] }),
  };
  log('Tiers ready.');

  const mark = async (contactId) => { await q('UPDATE org_constituents SET notes = $1 WHERE id = $2 AND org_id = $3', [NOTE, contactId, orgId]); };
  const member = async (label, kind, tierId, body) => {
    const contact = kind === 'organization'
      ? { kind, display_name: label, email: null }
      : { kind, display_name: label, first_name: label, last_name: '', email: null };
    const r = await call('POST', '/dues-members', { body: { tier_id: tierId, contact, ...body } });
    await mark(r.constituent_id);
    return r;
  };
  const pay = (termId, body) => call('POST', '/terms/:id/payments', { params: { id: termId }, body: { notes: NOTE, ...body } });

  const m1 = await member('Dues member 1', 'individual', T.individual, { starts_on: dayOffset(today, -120), ends_on: dayOffset(today, 244) });
  await pay(m1.term_id, { amount: 200, method: 'check', payment_date: dayOffset(today, -118) });
  const m2 = await member('Dues member 2', 'individual', T.community, { starts_on: dayOffset(today, -60), ends_on: dayOffset(today, 304), price: 40 });
  await pay(m2.term_id, { amount: 40, method: 'transfer', payment_date: dayOffset(today, -58) });
  const m3 = await member('Dues member 3', 'individual', T.student, { starts_on: dayOffset(today, -375), ends_on: dayOffset(today, -10) });
  await pay(m3.term_id, { amount: 30, method: 'cash', payment_date: dayOffset(today, -374) });
  const m4 = await member('Dues member 4', 'individual', T.individual, { starts_on: dayOffset(today, -460), ends_on: dayOffset(today, -95) });
  await pay(m4.term_id, { amount: 200, method: 'check', payment_date: dayOffset(today, -459) });
  const m5 = await member('Dues member 5', 'individual', T.affected, { starts_on: dayOffset(today, -30), ends_on: dayOffset(today, 335) });
  const m6 = await member('Dues member 6', 'individual', T.individual, { starts_on: dayOffset(today, -3), ends_on: dayOffset(today, 361) });
  const m7 = await member('Dues member 7', 'individual', T.individual, { starts_on: dayOffset(today, -45), ends_on: dayOffset(today, 319) });
  await call('POST', '/terms/:id/waivers', { params: { id: m7.term_id }, body: { amount: 200, reason: 'Dues waived for hardship (sample data)', payment_date: dayOffset(today, -44) } });
  const m8 = await member('Dues member 8', 'individual', T.individual, { starts_on: dayOffset(today, -200), ends_on: dayOffset(today, 164) });
  await pay(m8.term_id, { amount: 200, method: 'check', payment_date: dayOffset(today, -199) });
  await call('POST', '/terms/:id/end', { params: { id: m8.term_id }, body: { reason: 'Moved away and asked to be removed (sample data)', ended_on: dayOffset(today, -20) } });
  const m9 = await member('Dues member 9', 'individual', T.individual, { starts_on: dayOffset(today, -335), ends_on: dayOffset(today, 30) });
  await pay(m9.term_id, { amount: 160, discount: 40, discount_reason: 'Early-bird discount (sample data)', method: 'check', payment_date: dayOffset(today, -334) });
  await call('POST', '/terms/:id/extend', { params: { id: m9.term_id }, body: { reason: 'Hardship, extended two months (sample data)', ends_on: dayOffset(today, 90) } });
  const o1 = await member('Dues member organization 1', 'organization', T.orgSmall, { starts_on: dayOffset(today, -90), ends_on: dayOffset(today, 274) });
  await pay(o1.term_id, { amount: 125, method: 'transfer', payment_date: dayOffset(today, -88) });
  const o2 = await member('Dues member organization 2', 'organization', T.orgLarge, { starts_on: dayOffset(today, -30), ends_on: dayOffset(today, 335) });
  await pay(o2.term_id, { amount: 1000, method: 'check', payment_date: dayOffset(today, -28) });
  log('Dues members, terms and payments ready.');

  await call('POST', '/terms/:id/seats', { params: { id: o1.term_id }, body: { contact: { display_name: 'Seat holder 1', email: null }, label: 'Primary contact' } });
  await call('POST', '/terms/:id/seats', { params: { id: o1.term_id }, body: { contact: { display_name: 'Seat holder 2', email: null }, label: 'Second seat' } });
  await q(`UPDATE org_constituents SET notes = $1 WHERE org_id = $2 AND display_name IN ('Seat holder 1', 'Seat holder 2') AND notes IS NULL`, [NOTE, orgId]);
  await call('PUT', '/dues-members/:id/directory', { params: { id: o2.constituent_id }, body: { listed: true, fields: ['name', 'tier', 'website'], visibility: 'public' } });
  await call('PUT', '/dues-members/:id/directory', { params: { id: m1.constituent_id }, body: { listed: true, fields: ['name', 'tier'], visibility: 'private' } });
  log('Seats and directory ready.');
  return { created: true };
}

async function counts(pool, orgId) {
  const like = '%' + MARKER + '%';
  const n = async (sql) => Number((await pool.query(sql, [orgId, like])).rows[0].n);
  const contacts = `(SELECT id FROM org_constituents WHERE org_id = $1 AND notes LIKE $2)`;
  return {
    tiers: await n(`SELECT count(*) AS n FROM org_membership_tiers WHERE org_id = $1 AND description LIKE $2`),
    contacts: await n(`SELECT count(*) AS n FROM org_constituents WHERE org_id = $1 AND notes LIKE $2`),
    terms: await n(`SELECT count(*) AS n FROM org_membership_terms WHERE org_id = $1 AND constituent_id IN ${contacts} AND $2 <> ''`),
    payments: await n(`SELECT count(*) AS n FROM org_membership_payments WHERE org_id = $1 AND constituent_id IN ${contacts} AND $2 <> ''`),
    seats: await n(`SELECT count(*) AS n FROM org_membership_seats WHERE org_id = $1 AND term_id IN (SELECT id FROM org_membership_terms WHERE constituent_id IN ${contacts}) AND $2 <> ''`),
  };
}

async function lastSeedAudit(pool, orgId, table) {
  const r = await pool.query(
    `SELECT metadata FROM org_audit_log WHERE org_id = $1 AND table_name = $2 AND metadata ->> 'seed' = $3 AND metadata ? 'previous' ORDER BY id DESC LIMIT 1`, [orgId, table, MARKER]);
  return r.rows[0] ? r.rows[0].metadata.previous : null;
}

async function remove(pool, orgId, opts) {
  const log = (opts && opts.log) || (() => {});
  const q = (sql, params) => pool.query(sql, params);
  const ids = async (sql, params) => (await q(sql, params)).rows.map((r) => Number(r.id));
  const like = '%' + MARKER + '%';
  const tiers = await ids(`SELECT id FROM org_membership_tiers WHERE org_id = $1 AND description LIKE $2`, [orgId, like]);
  const contacts = await ids(`SELECT id FROM org_constituents WHERE org_id = $1 AND notes LIKE $2`, [orgId, like]);
  if (!tiers.length && !contacts.length) return { removed: false };
  const terms = await ids(`SELECT id FROM org_membership_terms WHERE org_id = $1 AND (constituent_id = ANY($2::int[]) OR tier_id = ANY($3::int[]))`, [orgId, contacts, tiers]);
  const posted = (await q(`SELECT id FROM org_membership_payments WHERE org_id = $1 AND term_id = ANY($2::int[]) AND ledger_transaction_id IS NOT NULL`, [orgId, terms])).rows;
  if (posted.length) return { refused: true, problem: posted.length + ' sample payment(s) have been posted in Accounting. Reverse them in Accounting, Dues Postings first, then run --remove again.' };
  await q(`DELETE FROM org_membership_directory_optin WHERE org_id = $1 AND constituent_id = ANY($2::int[])`, [orgId, contacts]);
  await q(`DELETE FROM org_membership_seats WHERE org_id = $1 AND term_id = ANY($2::int[])`, [orgId, terms]);
  await q(`DELETE FROM org_membership_recognition WHERE org_id = $1 AND term_id = ANY($2::int[])`, [orgId, terms]);
  await q(`DELETE FROM org_membership_messages WHERE org_id = $1 AND term_id = ANY($2::int[])`, [orgId, terms]);
  await q(`UPDATE org_membership_payments SET refund_of_id = NULL WHERE org_id = $1 AND term_id = ANY($2::int[])`, [orgId, terms]);
  await q(`DELETE FROM org_membership_payments WHERE org_id = $1 AND term_id = ANY($2::int[])`, [orgId, terms]);
  await q(`UPDATE org_membership_terms SET renews_term_id = NULL WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, terms]);
  await q(`DELETE FROM org_membership_terms WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, terms]);
  await q(`DELETE FROM org_contact_roles WHERE org_id = $1 AND constituent_id = ANY($2::int[])`, [orgId, contacts]);
  await q(`DELETE FROM org_constituents WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, contacts]);
  await q(`DELETE FROM org_membership_tier_prices WHERE org_id = $1 AND tier_id = ANY($2::int[])`, [orgId, tiers]);
  await q(`DELETE FROM org_membership_tiers WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, tiers]);
  const prev = await lastSeedAudit(pool, orgId, 'org_membership_settings');
  if (prev && prev.existed === false) await q('DELETE FROM org_membership_settings WHERE org_id = $1', [orgId]);
  await q(`DELETE FROM org_accounts WHERE org_id = $1 AND description LIKE $2 AND NOT EXISTS (SELECT 1 FROM org_ledger_lines l WHERE l.account_id = org_accounts.id)`, [orgId, like]);
  log('Removed ' + tiers.length + ' tiers, ' + contacts.length + ' contacts and ' + terms.length + ' terms.');
  return { removed: true, tiers: tiers.length, contacts: contacts.length, terms: terms.length };
}

module.exports = { MARKER, plan, prerequisites, apply, remove, counts, routeCaller };

function parseArgs(argv) {
  const out = { org: null, apply: false, remove: false, user: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org') out.org = Number(argv[++i]);
    else if (a === '--apply') out.apply = true;
    else if (a === '--remove') out.remove = true;
    else if (a === '--user') out.user = argv[++i];
  }
  return out;
}

async function main() {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.org) || args.org < 1 || (args.apply && args.remove)) {
    console.log('Usage: node scripts/seed-membership-demo.js --org <workspace id> [--apply | --remove] [--user <email>]');
    process.exit(1);
  }
  const { Pool } = require('pg');
  require('pg').types.setTypeParser(1082, (v) => v);
  const raw = new Pool({ user: process.env.DB_USER || 'postgres', host: process.env.DB_HOST || 'localhost', database: process.env.DB_NAME || 'causal_db', password: process.env.DB_PASSWORD, port: process.env.DB_PORT || 5432 });
  const { wrapPoolWithOrgScoping } = lib('scopedPool');
  const { inOrg } = lib('sponsorStatements');
  const pool = wrapPoolWithOrgScoping(raw);
  const log = (m) => console.log(m);
  try {
    await inOrg(args.org, async () => {
      if (args.remove) {
        const r = await remove(pool, args.org, { log });
        if (r.refused) { console.log(r.problem); process.exitCode = 2; return; }
        if (!r.removed) console.log('Nothing to remove: this workspace has no sample data from this script.');
        else console.log('Done. Audit log entries stay; the audit log cannot be changed.');
        return;
      }
      const seeded = await alreadySeeded(pool, args.org);
      if (seeded.length) { console.log('The sample data is already in this workspace (' + seeded.length + ' sample tiers). Nothing changed.'); return; }
      const pre = await prerequisites(pool, args.org, { userEmail: args.user });
      if (pre.problems.length) { console.log('Cannot add the sample data yet:\n- ' + pre.problems.join('\n- ')); process.exitCode = 2; return; }
      if (!args.apply) {
        console.log('Dry run for ' + pre.ws.display_name + ', acting as ' + pre.actor.email + ' (' + pre.actor.role + '). It would create:');
        plan().forEach((l) => console.log('  ' + l));
        console.log('Run again with --apply to create it, and later with --remove to delete it.');
        return;
      }
      const r = await apply(pool, args.org, { log, userEmail: args.user });
      if (r.refused) { console.log('Cannot add the sample data yet:\n- ' + r.problems.join('\n- ')); process.exitCode = 2; return; }
      console.log('Done. Counts: ' + JSON.stringify(await counts(pool, args.org)));
    });
  } catch (e) {
    console.error('Stopped: ' + e.message);
    console.error('Some sample rows may already exist. Run with --remove to clear them, fix the cause, then run --apply again.');
    process.exitCode = 1;
  } finally {
    await raw.end();
  }
}

if (require.main === module) main();
