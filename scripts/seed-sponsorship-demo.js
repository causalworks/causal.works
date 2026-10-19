#!/usr/bin/env node
/* Sample data for the Sponsorship screens: four projects at different stages with gifts, fees, payment requests,
   holds, reports, agreements, documents and a closing, made through the same library functions and route handlers the
   screens use, so every link to Funding, Accounting, Compliance and the Document Vault can be clicked through.

   node scripts/seed-sponsorship-demo.js --org <id>                 dry run: checks the workspace and lists what it would create
   node scripts/seed-sponsorship-demo.js --org <id> --apply         creates it (a second run changes nothing)
   node scripts/seed-sponsorship-demo.js --org <id> --remove        deletes only what this script created
   Options: --email <address> for the project leads (default none; nothing is sent), --user <email> to act as that
   workspace user (default: a finance user, else an admin). Every row carries the marker seed:sponsorship-demo. */
'use strict';

const path = require('path');
const fs = require('fs');
const Module = require('module');

const SERVER = path.join(__dirname, '..', 'server');
const ORG = path.join(SERVER, 'organizational');
const lib = (name) => require(path.join(ORG, 'lib', name));

const MARKER = 'seed:sponsorship-demo';
const NOTE = 'Sample data (' + MARKER + ')';
const P = '/api/organizational/orgs/:slug';

// ---------- Dates ----------
function isoDay(d) { return d.toISOString().slice(0, 10); }
function dayOffset(today, n) { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoDay(d); }
function monthStart(today, monthsBack) { const d = new Date(today + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - monthsBack); return isoDay(d); }
function lastMonth(today) { return monthStart(today, 1).slice(0, 7); }
function later(a, b) { return a > b ? a : b; }

// ---------- Route handlers, run in-process as a workspace user ----------
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
  const modules = [
    ['routes/sponsored-projects.js', 'registerSponsoredProjectsRoutes'], ['routes/sponsorship.js', 'registerSponsorshipRoutes'],
    ['routes/sponsorshipRecords.js', 'registerSponsorshipRecordRoutes'], ['routes/donors.js', 'registerOrganizationalDonorRoutes'],
    ['routes/ledger.js', 'registerOrganizationalLedgerRoutes'], ['routes/grants.js', 'registerOrganizationalGrantRoutes'],
  ];
  try {
    for (const [file, fn] of modules) {
      const target = path.join(ORG, file);
      delete require.cache[target];
      require(target)[fn](app, pool);
      delete require.cache[target];
    }
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

function ok(result, what) {
  if (!result || result.httpStatus >= 400 || result.error) throw new Error(what + ' refused: ' + ((result && result.body && result.body.error) || (result && result.error) || 'no result'));
  return result.body || result;
}

// ---------- Workspace checks ----------
async function workspace(pool, orgId) {
  const r = await pool.query(
    `SELECT m.id, m.slug, m.display_name, s.fiscal_sponsorship_mode, s.fiscal_year_end_month FROM coop_members m LEFT JOIN org_settings s ON s.org_id = m.id WHERE m.id = $1`, [orgId]);
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
  const r = await pool.query(`SELECT id, name FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND notes_markdown LIKE $2 ORDER BY id`, [orgId, '%' + MARKER + '%']);
  return r.rows;
}

async function prerequisites(pool, orgId, opts) {
  const problems = [];
  const ws = await workspace(pool, orgId);
  if (!ws) return { problems: ['There is no workspace with id ' + orgId + '.'] };
  const actor = await findActor(pool, orgId, opts && opts.userEmail);
  if (!actor) problems.push(opts && opts.userEmail ? 'That person is not a user of this workspace.' : 'Add a finance or admin user to this workspace first.');
  else if (!['finance', 'admin'].includes(actor.role)) problems.push('Act as a finance or admin user (--user).');
  const programs = (await pool.query(`SELECT id, name FROM org_programs WHERE org_id = $1 AND active AND parent_id IS NULL AND NOT is_system_transfer_program ORDER BY is_default DESC, id`, [orgId])).rows;
  if (!programs.length) problems.push('Add at least one program first (Settings, Structure).');
  const bank = (await pool.query(`SELECT id, name FROM org_accounts WHERE org_id = $1 AND is_cash_account AND is_posting AND archived_at IS NULL ORDER BY id LIMIT 1`, [orgId])).rows[0];
  if (!bank) problems.push('Add a bank account to the chart of accounts first (Accounting, Banking).');
  const ss = (await pool.query('SELECT * FROM org_sponsor_settings WHERE org_id = $1', [orgId])).rows[0] || {};
  const pick = async (type, pattern) => (await pool.query(
    `SELECT id FROM org_accounts WHERE org_id = $1 AND type = $2::org_account_type AND is_posting AND archived_at IS NULL AND NOT is_cash_account
        AND COALESCE(standard_category, '') <> 'REV_CONTRIB' AND NOT is_system_contribution_revenue_account
      ORDER BY (name ~* $3) DESC, id LIMIT 1`, [orgId, type, pattern])).rows[0];
  const feeIncome = ss.fee_income_account_id ? { id: ss.fee_income_account_id } : await pick('income', 'fee|admin');
  const feeExpense = ss.fee_expense_account_id ? { id: ss.fee_expense_account_id } : await pick('expense', 'fee|admin');
  if (!feeIncome || !feeExpense) problems.push('Set the fee income and fee expense accounts in Sponsorship settings first, or add an income and an expense account for sponsorship fees to the chart of accounts.');
  return {
    problems, ws, actor, programs, bank, settings: ss,
    feeIncome: feeIncome && Number(feeIncome.id), feeExpense: feeExpense && Number(feeExpense.id),
    feeProgram: ss.fee_income_program_id ? Number(ss.fee_income_program_id) : (programs[0] && Number(programs[0].id)),
  };
}

// ---------- What it makes ----------
function plan(today) {
  return [
    'Sponsorship turned on for the workspace if it is off; fee accounts and fee program set in Sponsorship settings if empty.',
    'Accounts if missing: contributions, project expenses, donated goods revenue, donated property held (marked).',
    'Programs: one fund program per project (marked). Contacts: Project lead 1 to 4, Receiving entity 1, Donor 1 to 3, Vendor 1, Funder 1.',
    'Sample project 1 (comprehensive, active, 7% fee, signed agreement): gifts of $25,000 by check (donor letter missing), $8,000 by bank transfer (fee exempt, letter on file),',
    '  $1,500 by card left out of the books, a $10,000 grant and donated tools left for Accounting in Gift Postings; payment requests submitted, needing information,',
    '  rejected, approved, paid, and one of $7,500 waiting for its second approval; a $1,000 recall waiting for Accounting; lead link; documents; acknowledgments partly done;',
    '  an item waiting for approval; a funder report due ' + dayOffset(today, 20) + '; the statement for ' + lastMonth(today) + '.',
    'Sample project 2 (pre-approved grant, receiving entity with W-9, 5% fee with a $250 quarterly minimum, signed agreement): a $4,000 wire, a donated laptop',
    '  ($2,400) posted as property and released, a $3,000 grant release approved and waiting for Accounting; report overdue since ' + dayOffset(today, -45) + ', so the daily rule holds it.',
    'Sample project 3 (comprehensive, winding down, no signed agreement): a $6,000 gift, a $2,000 payment paid, a closing transfer in preparation, and a hold with a reason.',
    'Sample project 4: an application in review in Intake. One gift of $500 with no project, for the review row in Gift Postings.',
  ];
}

// ---------- Apply ----------
async function apply(pool, orgId, opts) {
  const o = opts || {};
  const log = o.log || (() => {});
  const today = o.today || isoDay(new Date());
  const existing = await alreadySeeded(pool, orgId);
  if (existing.length) return { already: true, projects: existing };
  const pre = await prerequisites(pool, orgId, { userEmail: o.userEmail });
  if (pre.problems.length) return { refused: true, problems: pre.problems };
  const { ws, actor, bank } = pre;
  const userId = actor.user_id;
  const call = routeCaller(pool, { slug: ws.slug, user: userId });
  const { logAudit } = lib('auditLog');
  const q = (sql, params) => pool.query(sql, params);
  const one = async (sql, params) => (await q(sql, params)).rows[0];
  const created = { leadLinks: [] };

  // Workspace setup
  if (!ws.fiscal_sponsorship_mode) {
    await q('UPDATE org_settings SET fiscal_sponsorship_mode = true WHERE org_id = $1', [orgId]);
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_settings', recordId: orgId,
      fields: [{ fieldName: 'fiscal_sponsorship_mode', oldValue: 'false', newValue: 'true' }], metadata: { seed: MARKER, previous: { fiscal_sponsorship_mode: false } } });
  }
  const before = pre.settings || {};
  const wanted = {};
  if (!before.fee_income_account_id) wanted.fee_income_account_id = pre.feeIncome;
  if (!before.fee_expense_account_id) wanted.fee_expense_account_id = pre.feeExpense;
  if (!before.fee_income_program_id) wanted.fee_income_program_id = pre.feeProgram;
  if (Object.keys(wanted).length || !before.org_id) {
    await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_sponsor_settings', recordId: orgId,
      metadata: { seed: MARKER, previous: { existed: !!before.org_id, fee_income_account_id: before.fee_income_account_id || null, fee_expense_account_id: before.fee_expense_account_id || null, fee_income_program_id: before.fee_income_program_id || null } } });
    await call('PUT', '/sponsor-settings', { body: wanted });
  }
  const settings = await one('SELECT * FROM org_sponsor_settings WHERE org_id = $1', [orgId]);

  const account = async (type, where, code, name, extra) => {
    const found = await one(`SELECT id FROM org_accounts WHERE org_id = $1 AND type = $2::org_account_type AND is_posting AND archived_at IS NULL AND ${where} ORDER BY id LIMIT 1`, [orgId, type]);
    if (found) return Number(found.id);
    let c = Number(code);
    while (await one('SELECT 1 FROM org_accounts WHERE org_id = $1 AND code = $2', [orgId, String(c)])) c += 1;
    const r = await one(
      `INSERT INTO org_accounts (org_id, code, name, type, is_posting, level, standard_category, description) VALUES ($1, $2, $3, $4::org_account_type, true, 3, $5, $6) RETURNING id`,
      [orgId, String(c), name, type, (extra && extra.category) || null, NOTE]);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_accounts', recordId: r.id, metadata: { seed: MARKER } });
    return Number(r.id);
  };
  const acct = {
    contributions: await account('income', "standard_category = 'REV_CONTRIB'", 4090, 'Contributions to sponsored projects', { category: 'REV_CONTRIB' }),
    projectExpense: await account('expense', "name ~* 'sponsored project'", 6190, 'Sponsored project expenses'),
    inKindRevenue: await account('income', "name ~* 'in-kind|donated' AND NOT is_system_contribution_revenue_account", 4190, 'Donated goods revenue'),
    property: await account('asset', "NOT is_cash_account AND name ~* 'donated'", 1590, 'Donated property held for projects'),
  };

  const program = async (name) => {
    const r = await one(`INSERT INTO org_programs (org_id, name, description) VALUES ($1, $2, $3) RETURNING id`, [orgId, name, NOTE]);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_programs', recordId: r.id, metadata: { seed: MARKER } });
    return Number(r.id);
  };
  const { addContactRoles } = lib('contactRoles');
  const contact = async (name, kind, roles, email) => {
    const r = await one(`INSERT INTO org_constituents (org_id, display_name, kind, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING id`, [orgId, name, kind, email || null, NOTE]);
    if (roles.length) await addContactRoles(pool, orgId, r.id, roles);
    await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_constituents', recordId: r.id, metadata: { seed: MARKER } });
    return Number(r.id);
  };
  const c = {
    lead1: await contact('Project lead 1', 'individual', [], o.email), lead2: await contact('Project lead 2', 'individual', [], o.email),
    lead3: await contact('Project lead 3', 'individual', [], o.email), lead4: await contact('Project lead 4', 'individual', [], o.email),
    entity: await contact('Receiving entity 1', 'organization', ['vendor']), vendor: await contact('Vendor 1', 'organization', ['vendor']),
    donor1: await contact('Donor 1', 'individual', ['donor']), donor2: await contact('Donor 2', 'individual', ['donor']),
    donor3: await contact('Donor 3', 'individual', ['donor']), funder: await contact('Funder 1', 'organization', ['donor']),
  };
  log('Workspace set up: accounts, programs and contacts.');

  // Projects, through Intake: an application accepted, then the project edited
  const { createApplication, decideApplication } = lib('sponsorIntake');
  const startOf = { p1: monthStart(today, 10), p2: monthStart(today, 8), p3: monthStart(today, 20) };
  const project = async (key, name, lead, model, budgetCents, mission) => {
    const progId = await program(name + ' fund');
    const a = ok(await createApplication(pool, { orgId, userId, input: { project_name: name, lead_constituent_id: lead, budget_cents: budgetCents, mission }, source: 'staff' }), 'Application');
    const d = ok(await decideApplication(pool, { orgId, userId, applicationId: a.application.id, decision: 'accept', reason: 'Accepted by the board (sample data)', programId: progId, model }), 'Accepting the application');
    const id = Number(d.sponsored_project_id);
    await call('PATCH', '/sponsored-projects/:id', { params: { id: String(id) }, body: { start_date: startOf[key], status: 'active', notes_markdown: NOTE, disbursement_expense_account_id: acct.projectExpense } });
    return { id, program: progId };
  };
  const p1 = await project('p1', 'Sample project 1: community garden', c.lead1, 'model_a', 6000000, 'A shared garden that grows food for the neighborhood.');
  const p2 = await project('p2', 'Sample project 2: youth arts', c.lead2, 'model_c', 3000000, 'Art classes after school, run by a separate organization.');
  const p3 = await project('p3', 'Sample project 3: river cleanup', c.lead3, 'model_a', 1500000, 'Monthly cleanups along the river.');
  await call('POST', '/sponsored-projects/:id/fee-rules', { params: { id: String(p1.id) }, body: { kind: 'percent', rate: 7, effective_from: startOf.p1 } });
  await call('POST', '/sponsored-projects/:id/fee-rules', { params: { id: String(p2.id) }, body: { kind: 'percent', rate: 5, minimum_quarter_cents: 25000, effective_from: startOf.p2 } });
  await call('POST', '/sponsored-projects/:id/fee-rules', { params: { id: String(p3.id) }, body: { kind: 'percent', rate: 8, effective_from: startOf.p3 } });
  const app4 = ok(await createApplication(pool, { orgId, userId, input: { project_name: 'Sample project 4: tool library', lead_constituent_id: c.lead4, budget_cents: 1200000, mission: 'Lend tools to neighbors.' }, source: 'staff' }), 'Application');
  ok(await decideApplication(pool, { orgId, userId, applicationId: app4.application.id, decision: 'in_review' }), 'Starting review');
  log('Projects created through Intake.');

  // Lead links (the token is shown once)
  for (const p of [p1, p2, p3]) {
    const l = await call('POST', '/sponsored-projects/:id/lead-links', { params: { id: String(p.id) }, body: { send: false, label: 'Sample link' } });
    created.leadLinks.push({ projectId: p.id, id: l.id, url: l.url });
  }
  const linkRef = (p) => 'link:' + created.leadLinks.find((l) => l.projectId === p.id).id;

  // Documents
  const { storeUploadedFile } = lib('sponsorDocuments');
  const doc = async (p, title, type) => {
    const text = '%PDF-1.4\n% ' + title + ' for project ' + p.id + ' (' + MARKER + ' ' + Date.now() + Math.random() + ')\n%%EOF\n';
    const r = await storeUploadedFile(pool, { orgId, projectId: p.id, buffer: Buffer.from(text), originalName: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.pdf', mimeType: 'application/pdf', title, docType: type, note: NOTE });
    return Number(ok(r, 'Document ' + title).id);
  };
  const docs = {
    p1Signed: await doc(p1, 'Signed agreement, project 1', 'agreement'), p1Insurance: await doc(p1, 'Insurance certificate, project 1', 'insurance'),
    p1Letters: await doc(p1, 'Correspondence with Funder 1', 'correspondence'), p1Proposal: await doc(p1, 'Draft proposal to Funder 1', 'correspondence'),
    p1DonorLetter: await doc(p1, 'Signed donor letter, Donor 2', 'donor_letter'),
    p2Signed: await doc(p2, 'Signed agreement, project 2', 'agreement'), p2W9: await doc(p2, 'W-9, Receiving entity 1', 'tax_form'),
    p2Grant: await doc(p2, 'Grant agreement, release 1', 'agreement'), p3Insurance: await doc(p3, 'Insurance certificate, project 3', 'insurance'),
  };

  // Agreements: project 1 and 2 signed, project 3 missing
  const { generateAgreement, recordSigned } = lib('sponsorAgreements');
  for (const [p, model, signedDoc, start] of [[p1, 'model_a', docs.p1Signed, startOf.p1], [p2, 'model_c', docs.p2Signed, startOf.p2]]) {
    const t = await one(`SELECT id FROM org_sponsor_agreement_templates WHERE (org_id = $1 OR org_id IS NULL) AND model = $2 AND archived_at IS NULL ORDER BY org_id NULLS LAST, id LIMIT 1`, [orgId, model]);
    const g = ok(await generateAgreement(pool, { orgId, userId, projectId: p.id, templateId: t.id, effectiveDate: start, termValues: { report_days: 30, notice_days: 60 } }), 'Generating the agreement');
    ok(await recordSigned(pool, { orgId, userId, projectId: p.id, agreementId: g.agreement.id, documentId: signedDoc, signedAt: dayOffset(start, 10) }), 'Recording the signed agreement');
  }
  ok(await lib('sponsorMoneyOut').setGrantEntity(pool, { orgId, userId, projectId: p2.id, input: { receiving_constituent_id: c.entity, w9_document_id: docs.p2W9, w9_received_at: dayOffset(startOf.p2, 5) } }), 'Naming the receiving entity');
  log('Documents and agreements recorded.');

  // Money in: Funding records the gift; Accounting records the deposit against it
  const { fiscalYearForDate, fyDateRange, getFiscalYearEndMonth } = lib('fiscalYear');
  const { isFiscalYearLocked } = lib('ledgerPosting');
  const fyEnd = (await getFiscalYearEndMonth(pool, orgId)) || 12;
  const openDate = async (date) => {
    let d = date;
    for (let i = 0; i < 5 && await isFiscalYearLocked(pool, orgId, fiscalYearForDate(d, fyEnd)); i++) d = fyDateRange(fiscalYearForDate(d, fyEnd) + 1, fyEnd).startDate;
    return d > today ? today : d;
  };
  const gift = async (body) => (await call('POST', '/gifts', { body: { notes: NOTE, ...body } })).id;
  const deposit = async (giftId, cents, date, p) => {
    const r = await call('POST', '/ledger/entries', { body: {
      entry_type: 'receive', transaction_date: date, bank_account_id: bank.id, memo: 'Deposit', reference_number: MARKER,
      lines: [{ account_id: acct.contributions, program_id: p.program, amount_cents: cents }], apply: { kind: 'crm_gift', id: giftId } } });
    return r.id;
  };
  const posted = async (p, donor, cents, daysAgo, method, extra) => {
    const date = await openDate(later(dayOffset(today, -daysAgo), startOf[p.key] || today));
    const id = await gift({ gift_type: 'donation', constituent_id: donor, sponsored_project_id: p.id, amount_cents: cents, received_at: date, payment_method: method, ...(extra || {}) });
    await deposit(id, cents, date, p);
    return id;
  };
  p1.key = 'p1'; p2.key = 'p2'; p3.key = 'p3';
  const g = {};
  g.p1Check = await posted(p1, c.donor1, 2500000, 200, 'check');
  g.p1Transfer = await posted(p1, c.donor2, 800000, 120, 'ach');
  g.p1Card = await gift({ gift_type: 'donation', constituent_id: c.donor3, sponsored_project_id: p1.id, amount_cents: 150000, received_at: dayOffset(today, -10), payment_method: 'credit_card' });
  g.p2Wire = await posted(p2, c.donor2, 400000, 150, 'wire');
  g.p3Card = await posted(p3, c.donor1, 600000, 300, 'credit_card');
  await call('PATCH', '/sponsored-projects/:id/gifts/:giftId/fee-exempt', { params: { id: String(p1.id), giftId: String(g.p1Transfer) }, body: { exempt: true, reason: 'The funder caps overhead (sample data)' } });
  ok(await lib('sponsorGifts').attachDonorLetter(pool, { orgId, userId, projectId: p1.id, giftId: g.p1Transfer, documentId: docs.p1DonorLetter }), 'Attaching the donor letter');
  const grant = await call('POST', '/grants', { body: { name: 'Sample grant to project 1', funder: 'Funder 1', constituent_id: c.funder, status: 'awarded', amount_cents: 1000000, revenue_account_id: acct.contributions, primary_program_id: p1.program, start_date: dayOffset(today, -30), end_date: dayOffset(today, 335), notes: NOTE } });
  const grantId = Number((grant.grant || grant).id);
  g.p1Grant = await gift({ gift_type: 'grant', grant_id: grantId, constituent_id: c.funder, sponsored_project_id: p1.id, amount_cents: 1000000, received_at: dayOffset(today, -5), payment_method: 'check' });
  g.p1Tools = await gift({ gift_type: 'donation', constituent_id: c.donor3, sponsored_project_id: p1.id, amount_cents: 60000, received_at: dayOffset(today, -15), payment_method: 'in_kind',
    in_kind_description: 'Donated garden tools', in_kind_valuation_method: 'donor_stated', in_kind_revenue_account_id: acct.inKindRevenue, in_kind_expense_account_id: acct.projectExpense });
  g.p2Laptop = await gift({ gift_type: 'donation', constituent_id: c.donor1, sponsored_project_id: p2.id, amount_cents: 240000, received_at: await openDate(dayOffset(today, -60)), payment_method: 'in_kind',
    in_kind_description: 'Donated laptop', in_kind_valuation_method: 'quoted_market_price', in_kind_revenue_account_id: acct.inKindRevenue, in_kind_expense_account_id: acct.property });
  ok(await lib('giftPosting').postInKindGift(pool, { orgId, userId, giftId: g.p2Laptop, postingDate: await openDate(dayOffset(today, -60)) }), 'Posting the donated laptop');
  g.untagged = await gift({ gift_type: 'donation', constituent_id: c.donor3, amount_cents: 50000, received_at: dayOffset(today, -3), payment_method: 'check' });
  log('Gifts recorded; some posted, some left for Accounting.');

  // Money out
  const mo = lib('sponsorMoneyOut');
  const role = actor.role;
  const request = async (p, payee, cents, purpose, daysToNeed) => Number(ok(await mo.createRequest(pool, { orgId, userId: null, projectId: p.id, linkRef: linkRef(p),
    input: { payee_constituent_id: payee, amount_cents: cents, purpose, method: 'check', needed_by: dayOffset(today, daysToNeed) } }), 'Payment request').request.id);
  const review = async (p, id, action, reason, extra) => ok(await mo.reviewRequest(pool, { orgId, userId, role, projectId: p.id, requestId: id, action, reason, ...(extra || {}) }), 'Reviewing a request');
  const { postDisbursement } = lib('disbursementPosting');
  const pay = async (disbId, date) => ok(await postDisbursement(pool, { orgId, userId, disbursementId: disbId, postingDate: date, expenseAccountId: acct.projectExpense, bankAccountId: bank.id }), 'Posting a payment');
  await request(p1, c.vendor, 90000, 'Printing flyers for the open day', 14);
  await review(p1, await request(p1, c.vendor, 120000, 'Seeds and soil', 10), 'needs_info', 'Send the supplier quote, please.');
  await review(p1, await request(p1, c.vendor, 300000, 'Travel to a conference', 30), 'reject', 'Travel is outside the approved budget.');
  await review(p1, await request(p1, c.vendor, 250000, 'Tools and wheelbarrows', 7), 'approve');
  const paid = await review(p1, await request(p1, c.vendor, 180000, 'Water bill', 3), 'approve');
  await pay(paid.disbursement_id, await openDate(dayOffset(today, -2)));
  await review(p1, await request(p1, c.vendor, 750000, 'Greenhouse kit', 21), 'approve');
  ok(await mo.createRecall(pool, { orgId, userId, projectId: p1.id, input: { amount_cents: 100000, recall_date: today, reason: 'Unspent funds from last year returned to the general fund' } }), 'Recall');
  await review(p2, await request(p2, c.entity, 300000, 'Grant for the spring term', 14), 'approve', undefined, { grantAgreementDocumentId: docs.p2Grant });
  ok(await lib('sponsorGifts').createPropertyRelease(pool, { orgId, userId, projectId: p2.id, giftId: g.p2Laptop, releaseDate: today, notes: 'For the classroom' }), 'Releasing the laptop');
  const p3Paid = await review(p3, await request(p3, c.vendor, 200000, 'Dumpster rental', 1), 'approve');
  await pay(p3Paid.disbursement_id, await openDate(dayOffset(today, -1)));
  log('Payment requests, payments and a recall recorded.');

  // Records: acknowledgments, an approval, reports, a statement
  const st = lib('sponsorStanding');
  for (const key of ['no_unapproved_spending', 'no_name_or_tax_number_use', 'conflict_of_interest', 'insurance']) {
    ok(await st.recordAcknowledgment(pool, { orgId, userId, projectId: p1.id, itemKey: key, acknowledgedOn: dayOffset(startOf.p1, 10), note: NOTE }), 'Acknowledgment');
  }
  await call('POST', '/sponsored-projects/:id/approvals', { params: { id: String(p1.id) }, body: { kind: 'proposal', title: 'Proposal to Funder 1', draft_document_id: docs.p1Proposal } });
  ok(await lib('sponsorReports').addFunderReport(pool, { orgId, userId, projectId: p1.id, input: { title: 'Report to Funder 1', due_date: dayOffset(today, 20), funder_constituent_id: c.funder, notes: NOTE } }), 'Funder report');
  ok(await lib('sponsorStatements').generateStatement(pool, { orgId, userId, projectId: p1.id, month: lastMonth(today), send: false }), 'Monthly statement');
  log('Acknowledgments, an approval request, a funder report and a statement recorded.');

  // Holds and closing
  await call('PATCH', '/sponsored-projects/:id', { params: { id: String(p2.id) }, body: { next_report_due: dayOffset(today, -45) } });
  await q('SELECT * FROM org_apply_sponsor_report_holds()');
  await call('PATCH', '/sponsored-projects/:id', { params: { id: String(p3.id) }, body: { status: 'winding_down' } });
  const { loadProjectBalance } = lib('sponsorBalance');
  const p3Available = (await loadProjectBalance(pool, orgId, p3.id)).balance.available_cents;
  ok(await lib('sponsorGrants').createClosing(pool, { orgId, userId, projectId: p3.id, input: {
    destination_kind: 'sponsor_decides', amount_cents: Math.max(0, p3Available - 50000), closing_date: dayOffset(today, 30), reason: 'The cleanup group is winding down; the rest goes to a similar project.' } }), 'Closing');
  ok(await mo.placeHold(pool, { orgId, userId, projectId: p3.id, reason: 'Final report and receipts under review' }), 'Hold');
  log('Overdue-report hold, closing and a manual hold recorded.');

  return { created: true, projects: [p1, p2, p3].map((p) => p.id), applicationId: app4.application.id, leadLinks: created.leadLinks };
}

// ---------- Remove ----------
async function lastSeedAudit(pool, orgId, table) {
  const r = await pool.query(
    `SELECT metadata FROM org_audit_log WHERE org_id = $1 AND table_name = $2 AND metadata ->> 'seed' = $3 AND metadata ? 'previous' ORDER BY id DESC LIMIT 1`, [orgId, table, MARKER]);
  return r.rows[0] ? r.rows[0].metadata.previous : null;
}

async function remove(pool, orgId, opts) {
  const log = (opts && opts.log) || (() => {});
  const { UPLOADS_ROOT } = lib('sponsorDocuments');
  const q = (sql, params) => pool.query(sql, params);
  const ids = async (sql, params) => (await q(sql, params)).rows.map((r) => Number(r.id));
  const like = '%' + MARKER + '%';
  const projects = await ids(`SELECT id FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND notes_markdown LIKE $2`, [orgId, like]);
  const contacts = await ids(`SELECT id FROM org_constituents WHERE org_id = $1 AND notes LIKE $2`, [orgId, like]);
  if (!projects.length && !contacts.length) return { removed: false };
  const gifts = await ids(`SELECT id FROM org_gifts WHERE org_id = $1 AND (notes LIKE $2 OR sponsored_project_id = ANY($3::int[]))`, [orgId, like, projects]);
  const disb = (await q(`SELECT id, ledger_transaction_id FROM org_sponsored_project_disbursements WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects])).rows;
  const txIds = new Set();
  const addTx = (rows, key) => rows.forEach((r) => { if (r[key || 'ledger_transaction_id']) txIds.add(Number(r[key || 'ledger_transaction_id'])); });
  addTx(disb);
  addTx((await q(`SELECT ledger_transaction_id FROM org_gifts WHERE id = ANY($1::int[])`, [gifts])).rows);
  addTx((await q(`SELECT ledger_transaction_id FROM org_sponsor_recalls WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects])).rows);
  addTx((await q(`SELECT ledger_transaction_id FROM org_sponsor_closings WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects])).rows);
  addTx((await q(`SELECT ledger_transaction_id FROM org_sponsor_fee_postings WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects])).rows);
  addTx((await q(`SELECT id AS ledger_transaction_id FROM org_ledger_transactions WHERE org_id = $1 AND reference_number = $2`, [orgId, MARKER])).rows);
  addTx((await q(`SELECT id AS ledger_transaction_id FROM org_ledger_transactions WHERE org_id = $1 AND reverses_transaction_id = ANY($2::int[])`, [orgId, [...txIds]])).rows);
  const docs = (await q(`SELECT id, stored_path FROM org_documents WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects])).rows;
  const grants = await ids(`SELECT id FROM org_grants WHERE org_id = $1 AND notes LIKE $2`, [orgId, like]);

  await q(`DELETE FROM org_sponsor_payment_requests WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects]);
  await q(`DELETE FROM org_sponsored_project_disbursements WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects]);
  for (const t of ['org_sponsor_recalls', 'org_sponsor_closings', 'org_sponsor_fee_postings', 'org_sponsor_statements', 'org_sponsor_approvals', 'org_sponsor_acknowledgments',
    'org_sponsor_reports', 'org_sponsor_agreement_amendments', 'org_sponsor_agreements', 'org_sponsor_fee_rules']) {
    await q(`DELETE FROM ${t} WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects]);
  }
  await q(`DELETE FROM org_sponsor_applications WHERE org_id = $1 AND (sponsored_project_id = ANY($2::int[]) OR lead_constituent_id = ANY($3::int[]))`, [orgId, projects, contacts]);
  await q(`UPDATE org_sponsored_projects SET w9_document_id = NULL, receiving_constituent_id = NULL, lead_constituent_id = NULL WHERE sponsor_org_id = $1 AND id = ANY($2::int[])`, [orgId, projects]);
  await q(`DELETE FROM org_gifts WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, gifts]);
  await q(`DELETE FROM org_ledger_transactions WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, [...txIds]]);
  await q(`DELETE FROM org_grants WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, grants]);
  await q(`DELETE FROM org_public_links WHERE org_id = $1 AND sponsored_project_id = ANY($2::int[])`, [orgId, projects]);
  await q(`DELETE FROM org_documents WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, docs.map((d) => Number(d.id))]);
  docs.forEach((d) => { try { fs.unlinkSync(path.join(UPLOADS_ROOT, d.stored_path)); } catch (e) { } });
  await q(`DELETE FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND id = ANY($2::int[])`, [orgId, projects]);

  const prev = await lastSeedAudit(pool, orgId, 'org_sponsor_settings');
  if (prev) {
    if (!prev.existed) await q('DELETE FROM org_sponsor_settings WHERE org_id = $1', [orgId]);
    else await q(`UPDATE org_sponsor_settings SET fee_income_account_id = $2, fee_expense_account_id = $3, fee_income_program_id = $4 WHERE org_id = $1`,
      [orgId, prev.fee_income_account_id, prev.fee_expense_account_id, prev.fee_income_program_id]);
  }
  const prevOrg = await lastSeedAudit(pool, orgId, 'org_settings');
  if (prevOrg && prevOrg.fiscal_sponsorship_mode === false) await q('UPDATE org_settings SET fiscal_sponsorship_mode = false WHERE org_id = $1', [orgId]);
  await q(`DELETE FROM org_constituents WHERE org_id = $1 AND id = ANY($2::int[])`, [orgId, contacts]);
  await q(`DELETE FROM org_programs WHERE org_id = $1 AND description LIKE $2 AND NOT EXISTS (SELECT 1 FROM org_ledger_lines l WHERE l.program_id = org_programs.id)`, [orgId, like]);
  await q(`DELETE FROM org_accounts WHERE org_id = $1 AND description LIKE $2 AND NOT EXISTS (SELECT 1 FROM org_ledger_lines l WHERE l.account_id = org_accounts.id)`, [orgId, like]);
  log('Removed ' + projects.length + ' projects, ' + gifts.length + ' gifts, ' + txIds.size + ' ledger entries, ' + docs.length + ' documents and ' + contacts.length + ' contacts.');
  return { removed: true, projects: projects.length, gifts: gifts.length, ledger: txIds.size, documents: docs.length, contacts: contacts.length };
}

// ---------- Counts (dry run and tests) ----------
async function counts(pool, orgId) {
  const like = '%' + MARKER + '%';
  const n = async (sql) => Number((await pool.query(sql, [orgId, like])).rows[0].n);
  const proj = `(SELECT id FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND notes_markdown LIKE $2)`;
  return {
    projects: await n(`SELECT count(*) AS n FROM org_sponsored_projects WHERE sponsor_org_id = $1 AND notes_markdown LIKE $2`),
    contacts: await n(`SELECT count(*) AS n FROM org_constituents WHERE org_id = $1 AND notes LIKE $2`),
    gifts: await n(`SELECT count(*) AS n FROM org_gifts WHERE org_id = $1 AND (notes LIKE $2 OR sponsored_project_id IN ${proj})`),
    requests: await n(`SELECT count(*) AS n FROM org_sponsor_payment_requests WHERE org_id = $1 AND sponsored_project_id IN ${proj}`),
    disbursements: await n(`SELECT count(*) AS n FROM org_sponsored_project_disbursements WHERE org_id = $1 AND sponsored_project_id IN ${proj}`),
    documents: await n(`SELECT count(*) AS n FROM org_documents WHERE org_id = $1 AND sponsored_project_id IN ${proj}`),
    applications: await n(`SELECT count(*) AS n FROM org_sponsor_applications a WHERE a.org_id = $1 AND a.lead_constituent_id IN (SELECT id FROM org_constituents WHERE org_id = $1 AND notes LIKE $2)`),
    ledger_entries: await n(`SELECT count(*) AS n FROM org_ledger_transactions WHERE org_id = $1 AND reference_number = '${MARKER}' AND $2 <> ''`),
  };
}

module.exports = { MARKER, plan, prerequisites, apply, remove, counts, routeCaller };

// ---------- Command line ----------
function parseArgs(argv) {
  const out = { org: null, apply: false, remove: false, email: null, user: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--org') out.org = Number.parseInt(argv[++i], 10);
    else if (a === '--apply') out.apply = true;
    else if (a === '--remove') out.remove = true;
    else if (a === '--email') out.email = argv[++i];
    else if (a === '--user') out.user = argv[++i];
  }
  return out;
}

async function main() {
  try { require('dotenv').config(); } catch (e) { }
  const args = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(args.org) || args.org < 1 || (args.apply && args.remove)) {
    console.log('Usage: node scripts/seed-sponsorship-demo.js --org <workspace id> [--apply | --remove] [--email <address>] [--user <email>]');
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
        if (!r.removed) console.log('Nothing to remove: this workspace has no sample data from this script.');
        else console.log('Done. Audit log entries stay; the audit log cannot be changed.');
        return;
      }
      const seeded = await alreadySeeded(pool, args.org);
      if (seeded.length) { console.log('The sample data is already in this workspace (' + seeded.map((p) => p.name).join(', ') + '). Nothing changed.'); return; }
      const pre = await prerequisites(pool, args.org, { userEmail: args.user });
      if (pre.problems.length) { console.log('Cannot add the sample data yet:\n- ' + pre.problems.join('\n- ')); process.exitCode = 2; return; }
      if (!args.apply) {
        console.log('Dry run for ' + pre.ws.display_name + ', acting as ' + pre.actor.email + ' (' + pre.actor.role + '). It would create:');
        plan(isoDay(new Date())).forEach((l) => console.log('  ' + l));
        console.log('Run again with --apply to create it, and later with --remove to delete it.');
        return;
      }
      const r = await apply(pool, args.org, { log, email: args.email, userEmail: args.user });
      if (r.refused) { console.log('Cannot add the sample data yet:\n- ' + r.problems.join('\n- ')); process.exitCode = 2; return; }
      console.log('Done. Counts: ' + JSON.stringify(await counts(pool, args.org)));
      console.log('Lead links (shown only now; keep them private):');
      r.leadLinks.forEach((l) => console.log('  project ' + l.projectId + ': ' + l.url));
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
