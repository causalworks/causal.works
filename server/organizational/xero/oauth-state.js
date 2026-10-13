'use strict';

const crypto = require('crypto');

const TTL_MS = 15 * 60 * 1000;

function stateSecret() {
  return String(process.env.XERO_STATE_SECRET || process.env.SESSION_SECRET || 'change-me');
}

function signOAuthState(payload) {
  const secret = stateSecret();
  const uid = Number(payload.uid);
  if (!Number.isFinite(uid) || uid < 1) {
    throw new Error('Invalid uid for OAuth state');
  }
  const slug = String(payload.slug || '').trim();
  let returnTo = null;
  if (payload.return_to === 'onboarding') returnTo = 'onboarding';
  const body = {
    uid,
    slug,
    exp: Date.now() + TTL_MS,
    ...(returnTo ? { return_to: returnTo } : {}),
  };
  const data = Buffer.from(JSON.stringify(body), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyOAuthState(token) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!data || !sig) return null;
  const secret = stateSecret();
  const expected = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try {
    body = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch (_) {
    return null;
  }
  if (!body || typeof body.slug !== 'string') return null;
  const uid = Number(body.uid);
  if (!Number.isFinite(uid) || uid < 1) return null;
  if (typeof body.exp !== 'number' || body.exp < Date.now()) return null;
  const returnTo = body.return_to === 'onboarding' ? 'onboarding' : null;
  return { uid, slug: body.slug, exp: body.exp, return_to: returnTo };
}

module.exports = { signOAuthState, verifyOAuthState, TTL_MS };
