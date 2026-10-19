'use strict';

// Public Membership routes (no sign-in): the join form and its email confirmation, the sign-in link for dues members,
// and their small account page (update details, see receipts, renew). Each route resolves the workspace from the slug,
// does one job and returns only what its page needs. Every route here is listed in route-access-allowlist.json.

const path = require('path');
const { publicRateLimit } = require('../lib/rateLimit');
const {
  enterWorkspace, createLink, createSignInLink, checkLink, recordUse, presentedToken, issueFormToken, guardForm,
} = require('../lib/publicLinks');
const { sendPlainEmail } = require('../lib/sendPlainEmail');
const { loadOrgDocInfo } = require('../lib/orgLetterhead');
const { logAudit, diffFields } = require('../lib/auditLog');
const M = require('../lib/membership');
const S = require('../lib/membershipStatus');
const J = require('../lib/membershipJoin');
const Pay = require('../lib/membershipPayments');

const PAGES = path.join(__dirname, '..', '..', '..', 'public', 'p');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GIFT_CENTS = 100000000;

function clip(v, n) {
  const t = M.text(v);
  return t ? t.slice(0, n) : null;
}

function baseUrl() {
  return (process.env.BASE_URL || '').replace(/\/$/, '');
}

function registerPublicMembershipRoutes(app, pool, opts) {
  const o = opts || {};
  const send = o.send || sendPlainEmail;
  const readLimit = publicRateLimit({ ipCapacity: 60, ipPerMinute: 30, now: o.now });
  const writeLimit = publicRateLimit({ ipCapacity: 10, ipPerMinute: 4, workspaceCapacity: 100, workspacePerMinute: 30, now: o.now });
  const mailLimit = publicRateLimit({ ipCapacity: 5, ipPerMinute: 1, workspaceCapacity: 60, workspacePerMinute: 20, now: o.now });
  const P = '/api/public/:slug/membership';
  const unavailable = (res) => res.status(404).json({ error: 'This page is not available.' });
  const oops = (res, where, e) => { console.error(where + ':', e.message); return res.status(500).json({ error: 'Something went wrong. Try again later.' }); };

  // Workspace with membership turned on. Sets req.workspace and req.membershipSettings.
  async function workspace(req, res, next) {
    try {
      const ws = await enterWorkspace(pool, req.params.slug);
      if (!ws) return unavailable(res);
      const on = await pool.query('SELECT membership_enabled FROM org_settings WHERE org_id = $1', [ws.id]);
      if (!on.rows[0] || !on.rows[0].membership_enabled) return unavailable(res);
      req.workspace = ws;
      req.membershipSettings = await M.getSettings(pool, ws.id);
      return next();
    } catch (e) { return oops(res, 'public membership workspace', e); }
  }

  function joinOpen(req, res, next) {
    if (!req.membershipSettings.join_form_enabled) return unavailable(res);
    return next();
  }

  function withLink(purpose) {
    return async function (req, res, next) {
      try {
        const checked = await checkLink(pool, { orgId: req.workspace.id, token: presentedToken(req), purpose });
        if (checked.refusal) return res.status(checked.refusal.httpStatus).json(checked.refusal.body);
        req.link = checked.link;
        return next();
      } catch (e) { return oops(res, 'public membership link', e); }
    };
  }

  async function formGuard(req, res, next) {
    try {
      const refusal = await guardForm(pool, req, req.workspace.id, { now: o.now && o.now(), fetch: o.fetch });
      if (refusal) return res.status(refusal.httpStatus).json(refusal.body);
      return next();
    } catch (e) { return oops(res, 'public membership form guard', e); }
  }

  async function challengeKey(orgId) {
    const r = await pool.query('SELECT challenge_site_key, challenge_secret_enc IS NOT NULL AS on_ FROM org_public_settings WHERE org_id = $1', [orgId]);
    return r.rows[0] && r.rows[0].on_ ? r.rows[0].challenge_site_key : null;
  }

  async function mail(orgId, to, subject, lines) {
    const info = await loadOrgDocInfo(pool, orgId);
    return send({ to, fromName: info.displayName, replyTo: info.replyTo || undefined, subject: info.displayName + ': ' + subject, text: [...lines, '', info.displayName].join('\n') });
  }

  // --- Pages (link tokens stay in the URL fragment, which the browser never sends here) ---

  app.get('/p/:slug/join', readLimit, (req, res) => res.sendFile(path.join(PAGES, 'join.html')));
  app.get('/p/:slug/account', readLimit, (req, res) => res.sendFile(path.join(PAGES, 'account.html')));

  // --- Join ---

  app.get(`${P}/join`, readLimit, workspace, joinOpen, async (req, res) => {
    try {
      const ws = req.workspace;
      const s = req.membershipSettings;
      const tiers = await M.listTiers(pool, ws.id);
      return res.json({
        workspace_name: ws.display_name,
        tiers: tiers.map(J.publicTier),
        fields: (s.form_fields || []).filter((f) => J.FORM_FIELDS.includes(f)),
        extra_gift: !!s.extra_gift_enabled,
        payment_note: J.paymentNote(ws.display_name),
        challenge_site_key: await challengeKey(ws.id),
        form_token: issueFormToken(ws.id, o.now && o.now()),
      });
    } catch (e) { return oops(res, 'GET public membership join', e); }
  });

  app.post(`${P}/join`, mailLimit, workspace, joinOpen, formGuard, async (req, res) => {
    try {
      const ws = req.workspace;
      const s = req.membershipSettings;
      const b = req.body || {};
      const fields = (s.form_fields || []).filter((f) => J.FORM_FIELDS.includes(f));
      const kind = b.kind === 'organization' ? 'organization' : 'individual';
      const first = clip(b.first_name, 100);
      const last = clip(b.last_name, 100);
      const name = kind === 'organization' ? clip(b.organization_name, 200) : [first, last].filter(Boolean).join(' ');
      if (!name) return res.status(400).json({ error: kind === 'organization' ? 'Enter the organization\'s name.' : 'Enter your name.' });
      const email = clip(b.email, 200);
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter an email address we can send the confirmation link to.' });
      const tierId = Number.parseInt(String(b.tier_id), 10);
      const tier = (await M.listTiers(pool, ws.id)).find((t) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Choose a membership level.' });
      const plan = await M.planTerm(pool, ws.id, tier, kind, { price: tier.pay_what_you_can ? b.price : undefined, eligibility_confirmed: b.eligibility_confirmed === true || b.eligibility_confirmed === 'true' }, null);
      if (plan.error) return res.status(400).json({ error: plan.error });
      let gift = 0;
      if (s.extra_gift_enabled && b.extra_gift != null && String(b.extra_gift).trim() !== '') {
        const g = M.cents({ extra_gift: b.extra_gift }, 'extra_gift');
        if (g.error || g.value > MAX_GIFT_CENTS) return res.status(400).json({ error: 'Enter the extra gift as an amount, or leave it empty.' });
        gift = g.value || 0;
      }
      let budget = null;
      if (fields.includes('annual_budget') && kind === 'organization' && b.annual_budget != null && String(b.annual_budget).trim() !== '') {
        const bc = M.cents({ annual_budget: b.annual_budget }, 'annual_budget');
        if (bc.error) return res.status(400).json({ error: 'Enter the annual budget as an amount, or leave it empty.' });
        budget = bc.value;
      }
      const details = {
        display_name: name, first_name: kind === 'individual' ? first : null, last_name: kind === 'individual' ? last : null,
        phone: fields.includes('phone') ? clip(b.phone, 50) : null,
        mailing_address: fields.includes('mailing_address') ? clip(b.mailing_address, 500) : null,
        annual_budget_cents: budget,
      };
      const link = await createLink(pool, { orgId: ws.id, purpose: J.JOIN_CONFIRM, singleUse: true, days: 2 });
      const rq = await pool.query(
        `INSERT INTO org_membership_join_requests (org_id, kind, email, details, tier_id, price_cents, eligibility_confirmed, extra_gift_cents, link_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [ws.id, kind, email, JSON.stringify(details), tier.id, plan.price, !!(b.eligibility_confirmed === true || b.eligibility_confirmed === 'true'), gift, link.id]);
      const url = baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/join#t=' + link.token;
      const sent = await mail(ws.id, email, 'confirm your membership', [
        'Hello ' + name + ',', '', 'Thank you for joining ' + ws.display_name + '. Open this link to confirm your email address:', '', url, '',
        'The link works once, for two days. If you did not ask to join, ignore this email.']);
      return res.status(202).json({ request: rq.rows[0].id, emailed: !!sent, message: 'Check your email for a link to confirm your membership.' });
    } catch (e) { return oops(res, 'POST public membership join', e); }
  });

  app.post(`${P}/join/confirm`, writeLimit, workspace, withLink(J.JOIN_CONFIRM), async (req, res) => {
    try {
      const ws = req.workspace;
      const rq = (await pool.query(`SELECT id, status FROM org_membership_join_requests WHERE org_id = $1 AND link_id = $2`, [ws.id, req.link.id])).rows[0];
      if (!rq || rq.status !== 'unconfirmed') return res.status(401).json({ code: 'link_used', error: 'This link has already been used. Ask for a new one.' });
      if (!(await recordUse(pool, req, req.link, 'join_confirmed'))) return res.status(401).json({ code: 'link_used', error: 'This link has already been used. Ask for a new one.' });
      const approval = !!req.membershipSettings.join_requires_approval;
      await pool.query(`UPDATE org_membership_join_requests SET confirmed_at = now(), status = $1 WHERE id = $2`, [approval ? 'awaiting_approval' : 'unconfirmed', rq.id]);
      if (approval) {
        return res.json({ status: 'awaiting_approval', workspace_name: ws.display_name, message: 'Your email is confirmed. ' + ws.display_name + ' will review your request and write to you.' });
      }
      const out = await J.acceptJoin(pool, { orgId: ws.id, requestId: rq.id, userId: null });
      if (out.httpStatus >= 400) return res.status(out.httpStatus).json(out.body);
      const session = out.body.price_cents > 0 && await Pay.activeAccount(pool, ws.id, req.membershipSettings)
        ? await createLink(pool, { orgId: ws.id, purpose: J.SESSION, constituentId: out.body.constituent_id, minutes: J.SESSION_MINUTES })
        : null;
      return res.json({
        session: session ? session.token : null,
        status: 'joined', workspace_name: ws.display_name, starts_on: out.body.starts_on, ends_on: out.body.ends_on, price_cents: out.body.price_cents,
        payment_note: out.body.price_cents > 0 ? J.paymentNote(ws.display_name) : null,
      });
    } catch (e) { return oops(res, 'POST public membership join confirm', e); }
  });

  // --- Sign-in for dues members ---

  app.get(`${P}/sign-in`, readLimit, workspace, async (req, res) => {
    try {
      return res.json({ workspace_name: req.workspace.display_name, challenge_site_key: await challengeKey(req.workspace.id), form_token: issueFormToken(req.workspace.id, o.now && o.now()) });
    } catch (e) { return oops(res, 'GET public membership sign-in', e); }
  });

  app.post(`${P}/sign-in`, mailLimit, workspace, formGuard, async (req, res) => {
    const message = 'If that email belongs to a dues member, a sign-in link is on its way. It works once, for 30 minutes.';
    try {
      const ws = req.workspace;
      const email = clip((req.body || {}).email, 200);
      if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Enter your email address.' });
      const c = await J.contactForEmail(pool, ws.id, email);
      const isDues = c && (await pool.query('SELECT 1 FROM org_membership_terms WHERE org_id = $1 AND constituent_id = $2 LIMIT 1', [ws.id, c.id])).rows.length > 0;
      if (isDues) {
        const link = await createSignInLink(pool, { orgId: ws.id, purpose: J.SIGN_IN, constituentId: c.id });
        const url = baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/account#t=' + link.token;
        await mail(ws.id, email, 'your sign-in link', ['Hello ' + c.display_name + ',', '', 'Open this link to see your membership, update your details or renew:', '', url, '',
          'The link works once, for 30 minutes. If you did not ask for it, ignore this email.']);
      }
      return res.json({ message });
    } catch (e) { return oops(res, 'POST public membership sign-in', e); }
  });

  app.post(`${P}/session`, writeLimit, workspace, withLink(J.SIGN_IN), async (req, res) => {
    try {
      if (!(await recordUse(pool, req, req.link, 'sign_in'))) return res.status(401).json({ code: 'link_used', error: 'This link has already been used. Ask for a new one.' });
      const session = await createLink(pool, { orgId: req.workspace.id, purpose: J.SESSION, constituentId: req.link.constituent_id, minutes: J.SESSION_MINUTES });
      return res.json({ session: session.token, expires_at: session.expires_at });
    } catch (e) { return oops(res, 'POST public membership session', e); }
  });

  // --- Account (signed in) ---

  app.get(`${P}/me`, readLimit, workspace, withLink(J.SESSION), async (req, res) => {
    try {
      const ws = req.workspace;
      const view = await J.accountView(pool, ws.id, req.link.constituent_id);
      if (!view) return unavailable(res);
      await recordUse(pool, req, req.link, 'view');
      const tiers = (await M.listTiers(pool, ws.id)).filter((t) => t.applies_to === 'either' || t.applies_to === view.contact.kind);
      const settings = req.membershipSettings;
      const base = view.current_term && !view.renewal ? view.current_term.ends_on : null;
      return res.json({
        workspace_name: ws.display_name, ...view,
        renewal_open: !view.renewal && (!base || S.renewalOpen(base, M.today(), settings)),
        renewal_opens_on: base ? S.addDays(base, 1 - settings.renewal_window_days) : null,
        tiers: tiers.map(J.publicTier),
        payment_note: J.paymentNote(ws.display_name),
        card_payments: !!(await Pay.activeAccount(pool, ws.id, settings)),
        monthly_offered: !!settings.monthly_instalments_enabled,
        can_update_card: view.terms_customer_ref,
        form_token: issueFormToken(ws.id, o.now && o.now()),
      });
    } catch (e) { return oops(res, 'GET public membership me', e); }
  });

  app.post(`${P}/me/details`, writeLimit, workspace, withLink(J.SESSION), formGuard, async (req, res) => {
    try {
      const ws = req.workspace;
      const b = req.body || {};
      const before = (await pool.query('SELECT id, kind, display_name, first_name, last_name, phone, mailing_address FROM org_constituents WHERE id = $1 AND org_id = $2', [req.link.constituent_id, ws.id])).rows[0];
      if (!before) return unavailable(res);
      const next = { ...before };
      if (before.kind === 'individual') {
        if (b.first_name !== undefined) next.first_name = clip(b.first_name, 100);
        if (b.last_name !== undefined) next.last_name = clip(b.last_name, 100);
        next.display_name = [next.first_name, next.last_name].filter(Boolean).join(' ') || before.display_name;
      } else if (b.display_name !== undefined) {
        next.display_name = clip(b.display_name, 200) || before.display_name;
      }
      if (b.phone !== undefined) next.phone = clip(b.phone, 50);
      if (b.mailing_address !== undefined) next.mailing_address = clip(b.mailing_address, 500);
      const keys = ['display_name', 'first_name', 'last_name', 'phone', 'mailing_address'];
      const fields = diffFields(before, next, keys);
      if (!fields.length) return res.json({ saved: true });
      await pool.query(
        'UPDATE org_constituents SET display_name = $1, first_name = $2, last_name = $3, phone = $4, mailing_address = $5, updated_at = now() WHERE id = $6 AND org_id = $7',
        [next.display_name, next.first_name, next.last_name, next.phone, next.mailing_address, before.id, ws.id]);
      await logAudit(pool, { orgId: ws.id, userId: null, action: 'update', tableName: 'org_constituents', recordId: before.id, fields, metadata: { via: 'dues member account page', link: req.link.id } });
      await recordUse(pool, req, req.link, 'update_details');
      return res.json({ saved: true });
    } catch (e) { return oops(res, 'POST public membership me details', e); }
  });

  app.post(`${P}/me/checkout`, writeLimit, workspace, withLink(J.SESSION), async (req, res) => {
    try {
      const ws = req.workspace;
      const b = req.body || {};
      const plan = ['once', 'yearly', 'monthly'].includes(b.plan) ? b.plan : 'once';
      const terms = await M.loadTerms(pool, ws.id, [req.link.constituent_id]);
      const st = S.memberStatus(terms, M.today(), req.membershipSettings);
      const upcoming = terms.find((t) => t.starts_on > M.today() && t.status_override !== 'ended');
      const term = b.which === 'renewal' ? upcoming : (st && st.term);
      if (!term || term.status_override === 'ended') return res.status(400).json({ error: 'There is no membership to pay for. Renew first.' });
      const c = (await pool.query('SELECT email FROM org_constituents WHERE id = $1 AND org_id = $2', [req.link.constituent_id, ws.id])).rows[0];
      const back = baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/account';
      let out;
      try {
        out = await Pay.startCheckout(pool, { orgId: ws.id, workspaceName: ws.display_name, term, contact: c || {}, plan, successUrl: back + '#paid=1', cancelUrl: back });
      } catch (e) {
        console.error('public membership checkout:', e.message);
        return res.status(502).json({ error: 'The card payment page could not be opened. Try again later, or pay by check.' });
      }
      if (out.error) return res.status(400).json({ error: out.error });
      await recordUse(pool, req, req.link, 'checkout');
      return res.json({ url: out.url });
    } catch (e) { return oops(res, 'POST public membership me checkout', e); }
  });

  app.post(`${P}/me/card`, writeLimit, workspace, withLink(J.SESSION), async (req, res) => {
    try {
      const ws = req.workspace;
      const r = await pool.query(
        `SELECT processor_customer_ref FROM org_membership_terms WHERE org_id = $1 AND constituent_id = $2 AND processor_customer_ref IS NOT NULL ORDER BY starts_on DESC LIMIT 1`,
        [ws.id, req.link.constituent_id]);
      const back = baseUrl() + '/p/' + encodeURIComponent(ws.slug) + '/account';
      let out;
      try {
        out = await Pay.cardPortal(pool, { orgId: ws.id, customerRef: r.rows[0] && r.rows[0].processor_customer_ref, returnUrl: back });
      } catch (e) {
        console.error('public membership card portal:', e.message);
        return res.status(502).json({ error: 'The card page could not be opened. Try again later.' });
      }
      if (out.error) return res.status(400).json({ error: out.error });
      await recordUse(pool, req, req.link, 'card_update');
      return res.json({ url: out.url });
    } catch (e) { return oops(res, 'POST public membership me card', e); }
  });

  app.post(`${P}/me/renew`, writeLimit, workspace, withLink(J.SESSION), formGuard, async (req, res) => {
    try {
      const ws = req.workspace;
      const b = req.body || {};
      const contactId = req.link.constituent_id;
      const c = (await pool.query('SELECT id, kind FROM org_constituents WHERE id = $1 AND org_id = $2', [contactId, ws.id])).rows[0];
      if (!c) return unavailable(res);
      const terms = await M.loadTerms(pool, ws.id, [contactId]);
      const prev = S.renewalBase(terms);
      if (terms.some((t) => t.starts_on > M.today() && t.status_override !== 'ended')) {
        return res.status(409).json({ error: 'Your renewal is already on file.' });
      }
      if (prev && !S.renewalOpen(prev.ends_on, M.today(), req.membershipSettings)) {
        return res.status(400).json({ error: 'Renewal opens on ' + S.addDays(prev.ends_on, 1 - req.membershipSettings.renewal_window_days) + '.' });
      }
      const tierId = Number.parseInt(String(b.tier_id || (prev && prev.tier_id) || ''), 10);
      const tier = (await M.listTiers(pool, ws.id)).find((t) => t.id === tierId);
      if (!tier) return res.status(400).json({ error: 'Choose a membership level.' });
      const plan = await M.planTerm(pool, ws.id, tier, c.kind, { price: tier.pay_what_you_can ? b.price : undefined, eligibility_confirmed: b.eligibility_confirmed === true || b.eligibility_confirmed === 'true' }, prev);
      if (plan.error) return res.status(400).json({ error: plan.error });
      const client = await pool.connect();
      let term;
      try {
        await client.query('BEGIN');
        term = await M.insertTerm(client, { orgId: ws.id, userId: null, contactId, tier, plan, source: 'renewal', renewsTermId: prev ? prev.id : null });
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        throw e;
      } finally {
        client.release();
      }
      await logAudit(pool, { orgId: ws.id, userId: null, action: 'create', tableName: 'org_membership_terms', recordId: term.id, metadata: { via: 'dues member account page', tier: tier.name, price_cents: plan.price, renews: prev ? prev.id : null } });
      await recordUse(pool, req, req.link, 'renew');
      return res.status(201).json({ starts_on: plan.dates.starts_on, ends_on: plan.dates.ends_on, price_cents: plan.price, payment_note: plan.price > 0 ? J.paymentNote(ws.display_name) : null });
    } catch (e) { return oops(res, 'POST public membership me renew', e); }
  });
}

module.exports = { registerPublicMembershipRoutes };
