'use strict';

const { refreshAccessToken } = require('./xero-http');
const { encryptToken, decryptToken, isEncryptedEnvelope } = require('../lib/xeroTokenCrypto');

const REFRESH_SKEW_MS = 90 * 1000;

function bundleFromTokenResponse(tr) {
  const expiresIn = Number(tr.expires_in) || 1800;
  return {
    access_token: tr.access_token,
    refresh_token: tr.refresh_token,
    expires_at_ms: Date.now() + expiresIn * 1000,
    token_type: tr.token_type || 'Bearer',
    scope: tr.scope || '',
  };
}

async function loadOrgXeroRow(pool, orgId) {
  const r = await pool.query(
    `SELECT xero_tenant_id, xero_token_data FROM org_settings WHERE org_id = $1 LIMIT 1`,
    [orgId]
  );
  return r.rows[0] || null;
}

// access_token/refresh_token are the only two fields in this JSONB blob that are live
// credentials -- everything else (expires_at_ms, token_type, scope, last_token_persist_at)
// stays plaintext and readable by other call sites (xero/status, OrganizationalAttentionFeed)
// that only check truthiness/metadata, never the credential values themselves.
function encryptBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return bundle;
  const out = { ...bundle };
  if (typeof out.access_token === 'string') out.access_token = encryptToken(out.access_token);
  if (typeof out.refresh_token === 'string') out.refresh_token = encryptToken(out.refresh_token);
  return out;
}

function decryptBundle(td) {
  if (!td || typeof td !== 'object' || Array.isArray(td)) return td;
  const out = { ...td };
  if (isEncryptedEnvelope(out.access_token)) out.access_token = decryptToken(out.access_token);
  if (isEncryptedEnvelope(out.refresh_token)) out.refresh_token = decryptToken(out.refresh_token);
  return out;
}

async function persistTokens(pool, orgId, tenantId, bundle) {
  const withTouch =
    bundle && typeof bundle === 'object' && !Array.isArray(bundle)
      ? { ...bundle, last_token_persist_at: new Date().toISOString() }
      : bundle;
  await pool.query(
    `UPDATE org_settings
     SET xero_tenant_id = COALESCE($2, xero_tenant_id),
         xero_token_data = $3::jsonb,
         updated_at = NOW()
     WHERE org_id = $1`,
    [orgId, tenantId || null, JSON.stringify(encryptBundle(withTouch))]
  );
}

/** Drop OAuth tokens and tenant link (user revoked app in Xero, or explicit disconnect). */
async function clearXeroConnection(pool, orgId) {
  await pool.query(
    `UPDATE org_settings
     SET xero_tenant_id = NULL,
         xero_token_data = NULL,
         updated_at = NOW()
     WHERE org_id = $1`,
    [orgId]
  );
}

function refreshFailureMeansRevoked(err) {
  if (!err) return false;
  const body = err.body && typeof err.body === 'object' ? err.body : {};
  const oauthErr = String(body.error || '').toLowerCase();
  if (oauthErr === 'invalid_grant') return true;
  const msg = String(err.message || '').toLowerCase();
  return /invalid_grant|token.*revoked|consent|authorization has been denied/i.test(msg);
}

async function getValidAccessToken(pool, orgId) {
  const row = await loadOrgXeroRow(pool, orgId);
  if (
    !row ||
    row.xero_token_data == null ||
    typeof row.xero_token_data !== 'object' ||
    Array.isArray(row.xero_token_data)
  ) {
    return { error: 'not_connected' };
  }
  const td = decryptBundle(row.xero_token_data);
  const refresh = td.refresh_token;
  if (!td.access_token || !refresh) {
    return { error: 'not_connected' };
  }
  const exp = Number(td.expires_at_ms) || 0;
  if (exp > Date.now() + REFRESH_SKEW_MS) {
    return { accessToken: td.access_token, tenantId: row.xero_tenant_id };
  }
  let tr;
  try {
    tr = await refreshAccessToken(refresh);
  } catch (e) {
    console.error('Xero refresh failed for coop_org', orgId, e.message);
    if (refreshFailureMeansRevoked(e)) {
      try {
        await clearXeroConnection(pool, orgId);
        console.warn('Cleared Xero tokens for coop_org', orgId, '(revoked or invalid refresh)');
      } catch (clearErr) {
        console.error('Could not clear Xero row:', clearErr.message);
      }
      return { error: 'not_connected', detail: 'revoked_or_invalid' };
    }
    return { error: 'refresh_failed', detail: e.message };
  }
  const bundle = { ...td, ...bundleFromTokenResponse(tr) };
  await persistTokens(pool, orgId, row.xero_tenant_id, bundle);
  return { accessToken: bundle.access_token, tenantId: row.xero_tenant_id };
}

module.exports = {
  bundleFromTokenResponse,
  persistTokens,
  clearXeroConnection,
  getValidAccessToken,
  loadOrgXeroRow,
};
