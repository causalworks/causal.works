'use strict';

// Public links and public-form guards, shared by Sponsorship and Membership.
// Links: a random 32-byte token is shown once; only its hash is stored. A link is single use with a short expiry (sign-in)
// or longer-lived, scoped to one project or one contact, and revocable. Every use is logged; a token is never logged.
// Form guards: a hidden honeypot field, a signed form token that proves a minimum time between page load and submit,
// and an optional server-verified challenge token when the workspace has configured one.

const crypto = require('crypto');
const { enterOrgContext, enterProgramScope } = require('./orgContext');
const { decryptCredential } = require('./podCredentialCrypto');
const { clientIp } = require('./rateLimit');
const { publicHttpsProblem } = require('./publicHost');

const SIGN_IN_MINUTES = 30;
const HONEYPOT_FIELD = 'website';
const FORM_MIN_SECONDS = 3;
const FORM_MAX_SECONDS = 2 * 60 * 60;

function newToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function ipHash(req) { return crypto.createHmac('sha256', formSecret()).update('ip:' + clientIp(req)).digest('hex').slice(0, 32); }

function formSecret() {
  const secret = process.env.PUBLIC_FORM_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error('Set PUBLIC_FORM_SECRET (or SESSION_SECRET) before using public forms.');
  return secret;
}

// Workspace by slug, then enter its context so row-level security applies to every query after this.
async function enterWorkspace(pool, slug) {
  const r = await pool.query('SELECT id, display_name, slug FROM coop_members WHERE slug = $1 AND deleted_at IS NULL LIMIT 1', [String(slug || '')]);
  const ws = r.rows[0];
  if (!ws) return null;
  enterOrgContext(ws.id);
  enterProgramScope(null);
  return ws;
}

async function createLink(pool, { orgId, userId, purpose, projectId, constituentId, singleUse, days, minutes, label }) {
  if (!/^[a-z_]+$/.test(String(purpose || ''))) throw new Error('createLink: purpose must be a short lowercase key');
  const ms = minutes ? minutes * 60000 : (days || 30) * 86400000;
  const token = newToken();
  const r = await pool.query(
    `INSERT INTO org_public_links (org_id, purpose, sponsored_project_id, constituent_id, token_hash, single_use, expires_at, label, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, now() + ($7 || ' milliseconds')::interval, $8, $9) RETURNING id, expires_at`,
    [orgId, purpose, projectId || null, constituentId || null, hashToken(token), !!singleUse, String(ms), label || null, userId || null]);
  return { id: r.rows[0].id, token, expires_at: r.rows[0].expires_at };
}

function createSignInLink(pool, opts) {
  return createLink(pool, { ...opts, singleUse: true, minutes: SIGN_IN_MINUTES });
}

// Checks a presented token for a purpose inside the current workspace. Returns { link } or { refusal }.
async function checkLink(pool, { orgId, token, purpose }) {
  if (!token || typeof token !== 'string' || token.length < 20 || token.length > 200) {
    return { refusal: { httpStatus: 401, body: { code: 'link_invalid', error: 'This link is not valid. Ask the workspace for a new one.' } } };
  }
  const r = await pool.query('SELECT * FROM org_public_links WHERE org_id = $1 AND token_hash = $2 AND purpose = $3', [orgId, hashToken(token), purpose]);
  const link = r.rows[0];
  if (!link) return { refusal: { httpStatus: 401, body: { code: 'link_invalid', error: 'This link is not valid. Ask the workspace for a new one.' } } };
  if (link.revoked_at) return { refusal: { httpStatus: 401, body: { code: 'link_revoked', error: 'This link has been turned off. Ask the workspace for a new one.' } } };
  if (new Date(link.expires_at) <= new Date()) return { refusal: { httpStatus: 401, body: { code: 'link_expired', error: 'This link has expired. Ask the workspace for a new one.' } } };
  if (link.single_use && link.used_at) return { refusal: { httpStatus: 401, body: { code: 'link_used', error: 'This link has already been used. Ask for a new one.' } } };
  return { link };
}

// Records a use. A single-use link is claimed atomically so two requests cannot both use it.
async function recordUse(pool, req, link, action) {
  if (link.single_use) {
    const u = await pool.query('UPDATE org_public_links SET used_at = now(), last_used_at = now() WHERE id = $1 AND used_at IS NULL RETURNING id', [link.id]);
    if (!u.rows.length) return false;
  } else {
    await pool.query('UPDATE org_public_links SET last_used_at = now() WHERE id = $1', [link.id]);
  }
  await pool.query('INSERT INTO org_public_link_uses (org_id, link_id, action, ip_hash) VALUES ($1, $2, $3, $4)', [link.org_id, link.id, String(action).slice(0, 60), ipHash(req)]);
  return true;
}

async function revokeLink(pool, { orgId, userId, linkId, reason }) {
  const r = await pool.query(
    `UPDATE org_public_links SET revoked_at = now(), revoked_by = $1, revoke_reason = $2 WHERE id = $3 AND org_id = $4 AND revoked_at IS NULL RETURNING id`,
    [userId || null, reason || null, linkId, orgId]);
  return r.rows.length > 0;
}

// Token from the X-Link-Token header (pages keep it in the URL fragment, which browsers never send to the server).
function presentedToken(req) {
  const h = req.headers && (req.headers['x-link-token'] || req.headers['X-Link-Token']);
  return h ? String(h) : null;
}

// Form guards

function issueFormToken(orgId, now) {
  const t = String(now || Date.now());
  const sig = crypto.createHmac('sha256', formSecret()).update(orgId + '.' + t).digest('base64url');
  return t + '.' + sig;
}

function checkFormToken(orgId, token, now) {
  const [t, sig] = String(token || '').split('.');
  if (!t || !sig) return 'form_token_missing';
  const want = crypto.createHmac('sha256', formSecret()).update(orgId + '.' + t).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return 'form_token_bad';
  const age = ((now || Date.now()) - Number(t)) / 1000;
  if (!(age >= FORM_MIN_SECONDS)) return 'too_fast';
  if (age > FORM_MAX_SECONDS) return 'form_expired';
  return null;
}

async function verifyChallenge(pool, orgId, challengeToken, req, fetchImpl) {
  const r = await pool.query('SELECT * FROM org_public_settings WHERE org_id = $1', [orgId]);
  const s = r.rows[0];
  if (!s || !s.challenge_verify_url || !s.challenge_secret_enc) return true;
  if (!challengeToken) return false;
  if (!fetchImpl && await publicHttpsProblem(s.challenge_verify_url)) return false;
  try {
    const secret = decryptCredential({ encrypted: s.challenge_secret_enc, iv: s.challenge_secret_iv, authTag: s.challenge_secret_tag });
    const body = new URLSearchParams({ secret, response: String(challengeToken), remoteip: clientIp(req) });
    const res = await (fetchImpl || fetch)(s.challenge_verify_url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    const data = await res.json().catch(() => ({}));
    return !!data.success;
  } catch (e) {
    console.error('verifyChallenge:', e.message);
    return false;
  }
}

// Runs the honeypot, timing and challenge checks on a public form submission. Returns null when it passes, or a refusal.
async function guardForm(pool, req, orgId, opts) {
  const body = req.body || {};
  const refuse = (code, error) => ({ httpStatus: 400, body: { code, error } });
  if (body[HONEYPOT_FIELD]) return refuse('rejected', 'This form could not be sent. Try again.');
  const t = checkFormToken(orgId, body.form_token, opts && opts.now);
  if (t === 'too_fast') return refuse('too_fast', 'That was quicker than a person can fill in the form. Wait a moment and send it again.');
  if (t === 'form_expired') return refuse('form_expired', 'This form was open too long. Reload the page and send it again.');
  if (t) return refuse('form_token', 'This form could not be checked. Reload the page and send it again.');
  if (!(await verifyChallenge(pool, orgId, body.challenge_token, req, opts && opts.fetch))) return refuse('challenge_failed', 'The check that you are a person did not pass. Try again.');
  return null;
}

module.exports = {
  SIGN_IN_MINUTES, HONEYPOT_FIELD, FORM_MIN_SECONDS, newToken, hashToken, enterWorkspace, createLink, createSignInLink, checkLink,
  recordUse, revokeLink, presentedToken, formSecret, issueFormToken, checkFormToken, verifyChallenge, guardForm,
};
