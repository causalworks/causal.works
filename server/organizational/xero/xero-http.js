'use strict';

const {
  xeroRedirectUri,
  xeroClientId,
  xeroClientSecret,
  xeroScopes,
} = require('./config');

const XERO_AUTH = 'https://login.xero.com/identity/connect/authorize';
const XERO_TOKEN = 'https://identity.xero.com/connect/token';
const XERO_API = 'https://api.xero.com';

function buildAuthorizeUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: xeroClientId(),
    redirect_uri: xeroRedirectUri(),
    scope: xeroScopes(),
    state,
  });
  return `${XERO_AUTH}?${params.toString()}`;
}

async function postForm(url, bodyObj) {
  const body = new URLSearchParams(bodyObj);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(json.error_description || json.error || res.statusText || 'Xero token error');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function exchangeCodeForTokens(code) {
  return postForm(XERO_TOKEN, {
    grant_type: 'authorization_code',
    code: String(code || '').trim(),
    redirect_uri: xeroRedirectUri(),
    client_id: xeroClientId(),
    client_secret: xeroClientSecret(),
  });
}

async function refreshAccessToken(refreshToken) {
  return postForm(XERO_TOKEN, {
    grant_type: 'refresh_token',
    refresh_token: String(refreshToken || '').trim(),
    client_id: xeroClientId(),
    client_secret: xeroClientSecret(),
  });
}

async function fetchConnections(accessToken) {
  const res = await fetch(`${XERO_API}/connections`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const text = await res.text();
  let json = [];
  try {
    json = text ? JSON.parse(text) : [];
  } catch (_) {
    json = [];
  }
  if (!res.ok) {
    const err = new Error((json && json.Message) || res.statusText || 'connections failed');
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return Array.isArray(json) ? json : [];
}

async function xeroGetJson(accessToken, tenantId, path) {
  const res = await fetch(`${XERO_API}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'xero-tenant-id': String(tenantId || '').trim(),
    },
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = {};
  }
  if (!res.ok) {
    const err = new Error(
      (json && (json.Message || json.message)) || res.statusText || 'Xero API error'
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function xeroPutJson(accessToken, tenantId, path, bodyObj) {
  const res = await fetch(`${XERO_API}${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'xero-tenant-id': String(tenantId || '').trim(),
    },
    body: JSON.stringify(bodyObj && typeof bodyObj === 'object' ? bodyObj : {}),
  });
  const text = await res.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch (_) {
    json = {};
  }
  if (!res.ok) {
    const v0 =
      json &&
      json.Elements &&
      json.Elements[0] &&
      json.Elements[0].ValidationErrors &&
      json.Elements[0].ValidationErrors[0] &&
      json.Elements[0].ValidationErrors[0].Message;
    const err = new Error(
      (json && (json.Message || json.message || v0)) || res.statusText || 'Xero API error'
    );
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  fetchConnections,
  xeroGetJson,
  xeroPutJson,
  XERO_API,
};
