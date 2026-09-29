'use strict';

const { verifyOAuthState } = require('./oauth-state');
const { isXeroConfigured } = require('./config');
const {
  exchangeCodeForTokens,
  fetchConnections,
} = require('./xero-http');
const { bundleFromTokenResponse, persistTokens } = require('./org-tokens');
const { orgIdForMember } = require('../lib/resolveOrganizationalOrg');

function redirectToOrg(res, slug, query, returnTo) {
  const q = new URLSearchParams(query);
  const qs = q.toString();
  if (returnTo === 'onboarding') {
    const oq = new URLSearchParams({ step: 'accounts' });
    if (query && typeof query === 'object') {
      if (query.xero) oq.set('xero', String(query.xero));
      if (query.reason != null && query.reason !== '') oq.set('reason', String(query.reason));
    }
    res.redirect(302, `/organizational/o/${encodeURIComponent(slug)}/onboarding?${oq.toString()}`);
    return;
  }
  res.redirect(302, `/organizational/o/${encodeURIComponent(slug)}${qs ? `?${qs}` : ''}`);
}

async function handleOrganizationalXeroCallback(pool, req, res) {
  const userId = req.user.user_id ?? req.user.id;
  const err = String(req.query.error || '').trim();
  const stateRaw = String(req.query.state || '').trim();
  const code = String(req.query.code || '').trim();

  const st = verifyOAuthState(stateRaw);
  if (!st) {
    return res.status(400).send('Invalid or expired OAuth state. Close this tab and try Connect again.');
  }
  if (Number(st.uid) !== Number(userId)) {
    return res.status(403).send('OAuth state does not match the signed-in user.');
  }
  const slug = st.slug;

  const ret = st.return_to || null;

  if (err) {
    return redirectToOrg(res, slug, { xero: 'error', reason: err }, ret);
  }
  if (!code) {
    return redirectToOrg(res, slug, { xero: 'error', reason: 'missing_code' }, ret);
  }
  if (!isXeroConfigured()) {
    return redirectToOrg(res, slug, { xero: 'error', reason: 'not_configured' }, ret);
  }

  let orgId;
  try {
    orgId = await orgIdForMember(pool, userId, slug);
  } catch (e) {
    console.error('Xero callback org resolve:', e.message);
    return redirectToOrg(res, slug, { xero: 'error', reason: 'db' }, ret);
  }
  if (!orgId) {
    return redirectToOrg(res, slug, { xero: 'error', reason: 'org_not_found' }, ret);
  }

  let tr;
  try {
    tr = await exchangeCodeForTokens(code);
  } catch (e) {
    console.error('Xero token exchange:', e.message);
    return redirectToOrg(res, slug, { xero: 'error', reason: 'token_exchange' }, ret);
  }

  const bundle = bundleFromTokenResponse(tr);
  let tenantId = null;
  try {
    const connections = await fetchConnections(bundle.access_token);
    if (connections.length > 0) {
      const t0 = connections[0];
      tenantId = t0.tenantId || t0.TenantId || null;
    }
  } catch (e) {
    console.error('Xero connections:', e.message);
    return redirectToOrg(res, slug, { xero: 'error', reason: 'connections' }, ret);
  }
  if (!tenantId) {
    return redirectToOrg(res, slug, { xero: 'error', reason: 'no_tenant' }, ret);
  }

  try {
    await persistTokens(pool, orgId, tenantId, bundle);
  } catch (e) {
    console.error('Xero persist tokens:', e.message);
    return redirectToOrg(res, slug, { xero: 'error', reason: 'db' }, ret);
  }

  let successReturnTo = ret;
  try {
    const stepRow = await pool.query(
      `SELECT onboarding_step FROM org_settings WHERE org_id = $1 LIMIT 1`,
      [orgId]
    );
    if (stepRow.rows[0] && String(stepRow.rows[0].onboarding_step || '') === 'accounts') {
      successReturnTo = 'onboarding';
    }
  } catch (e) {
    console.warn('Xero callback onboarding_step lookup:', e.message);
  }

  return redirectToOrg(res, slug, { xero: 'connected' }, successReturnTo);
}

module.exports = { handleOrganizationalXeroCallback };
