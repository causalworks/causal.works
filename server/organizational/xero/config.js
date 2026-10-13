'use strict';

function baseUrlNoSlash() {
  return String(process.env.BASE_URL || 'https://causal.works').replace(/\/$/, '');
}

function xeroRedirectUri() {
  const explicit = String(process.env.XERO_REDIRECT_URI || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return `${baseUrlNoSlash()}/organizational/xero/callback`;
}

function xeroClientId() {
  return String(process.env.XERO_CLIENT_ID || '').trim();
}

function xeroClientSecret() {
  return String(process.env.XERO_CLIENT_SECRET || '').trim();
}

function xeroScopes() {
  return String(
    process.env.XERO_SCOPES ||
      'offline_access openid profile email accounting.settings accounting.transactions.read'
  ).trim();
}

function isXeroConfigured() {
  return !!(xeroClientId() && xeroClientSecret());
}

module.exports = {
  baseUrlNoSlash,
  xeroRedirectUri,
  xeroClientId,
  xeroClientSecret,
  xeroScopes,
  isXeroConfigured,
};
