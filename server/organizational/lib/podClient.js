'use strict';

const crypto = require('crypto');
const { generateKeyPair, SignJWT, exportJWK } = require('jose');

const POD_ROOT = process.env.POD_ROOT_OVERRIDE || 'https://data.causal.works/';

function podBaseForOrg(orgSlug) {
  return `${POD_ROOT}${encodeURIComponent(orgSlug)}/`;
}

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function resourceUrlFor(orgSlug, doc) {
  const path = require('path');
  const ext = path.extname(doc.original_filename || '') || '';
  return `${podBaseForOrg(orgSlug)}documents/${doc.category}/${doc.id}-${slugify(doc.title)}${ext}`;
}

async function accountFetch(url, opts, authorization) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers['content-type'] = 'application/json';
  if (authorization) headers.authorization = `CSS-Account-Token ${authorization}`;
  const res = await fetch(url, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${url} -> ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function loginWithCredential(email, password) {
  if (!email || !password) {
    throw new Error('email/password required for loginWithCredential');
  }
  const accountBase = `${new URL(POD_ROOT).origin}/.account/`;
  const login = await accountFetch(`${accountBase}login/password/`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  const account = await accountFetch(accountBase, { method: 'GET' }, login.authorization);
  return { authorization: login.authorization, account };
}

async function loginToAccount() {
  const email = process.env.CSS_POD_ADMIN_EMAIL;
  const password = process.env.CSS_POD_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('CSS_POD_ADMIN_EMAIL / CSS_POD_ADMIN_PASSWORD not set (check /root/css-pod/.env)');
  }
  return loginWithCredential(email, password);
}

async function registerNewPodAccount(slug, emailPrefix) {
  const accountBase = `${new URL(POD_ROOT).origin}/.account/`;

  const created = await accountFetch(`${accountBase}account/`, { method: 'POST' });
  const authorization = created.authorization;
  const acc = await accountFetch(accountBase, { method: 'GET' }, authorization);

  const email = `${emailPrefix || `pod-${slug}`}@internal.causal.works`;
  const password = crypto.randomBytes(24).toString('base64url');
  await accountFetch(acc.controls.password.create, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, authorization);

  const podRes = await fetch(acc.controls.account.pod, {
    method: 'POST',
    headers: { authorization: `CSS-Account-Token ${authorization}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: slug }),
  });
  const podBody = await podRes.json();
  if (!podRes.ok) {
    throw new Error(`Pod creation failed for ${slug}: ${podRes.status} ${JSON.stringify(podBody)}`);
  }

  return { email, password, webId: podBody.webId, podUrl: podBody.pod };
}

async function createPod(orgSlug) {
  const { authorization, account } = await loginToAccount();
  const createPodLink = account.controls?.account?.pod;
  if (!createPodLink) throw new Error('CSS account has no pod-creation control link');

  const res = await fetch(createPodLink, {
    method: 'POST',
    headers: { authorization: `CSS-Account-Token ${authorization}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name: orgSlug }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) {
    throw new Error(`Pod creation failed for ${orgSlug}: ${res.status} ${JSON.stringify(body)}`);
  }
  return { podUrl: podBaseForOrg(orgSlug), alreadyExisted: res.status === 409 };
}

async function verifyWebIdBelongsToAccount(authorization, account, webId) {
  const webIdLink = account.controls?.account?.webId;
  const webIdInfo = await accountFetch(webIdLink, { method: 'GET' }, authorization);
  if (!Object.prototype.hasOwnProperty.call(webIdInfo.webIdLinks || {}, webId)) {
    throw new Error(`WebID ${webId} is not linked to this CSS account - was its pod actually created under this account?`);
  }
}

async function getAuthenticatedFetchForCredential(email, password, webId) {
  const { authorization, account } = await loginWithCredential(email, password);
  await verifyWebIdBelongsToAccount(authorization, account, webId);
  const credLink = account.controls?.account?.clientCredentials;
  const cred = await accountFetch(credLink, {
    method: 'POST',
    body: JSON.stringify({ name: 'causal-app-pod-client', webId }),
  }, authorization);

  const origin = new URL(POD_ROOT).origin;
  const tokenUrl = `${origin}/.oidc/token`;
  const dpopKeyPair = await generateKeyPair('ES256');
  const dpopJwk = await exportJWK(dpopKeyPair.publicKey);

  async function dpopProof(url, method, accessToken) {
    const claims = { htu: url, htm: method, jti: crypto.randomUUID() };
    if (accessToken) claims.ath = crypto.createHash('sha256').update(accessToken).digest('base64url');
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', typ: 'dpop+jwt', jwk: dpopJwk })
      .setIssuedAt()
      .sign(dpopKeyPair.privateKey);
  }

  const basicAuth = Buffer.from(`${encodeURIComponent(cred.id)}:${encodeURIComponent(cred.secret)}`).toString('base64');
  const tokenRes = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      authorization: `Basic ${basicAuth}`,
      'content-type': 'application/x-www-form-urlencoded',
      dpop: await dpopProof(tokenUrl, 'POST'),
    },
    body: 'grant_type=client_credentials&scope=webid',
  });
  const tokenBody = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(`token request failed: ${JSON.stringify(tokenBody)}`);

  return async function authFetch(url, opts = {}) {
    const proof = await dpopProof(url, opts.method || 'GET', tokenBody.access_token);
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        authorization: `DPoP ${tokenBody.access_token}`,
        dpop: proof,
      },
    });
  };
}

async function deleteAccount(email, password) {
  const { authorization, account } = await loginWithCredential(email, password);
  const accountUrl = account.controls?.html?.account?.account;
  if (!accountUrl) {
    throw new Error('CSS account response has no controls.html.account.account resource to delete');
  }
  const res = await fetch(accountUrl, {
    method: 'DELETE',
    headers: { authorization: `CSS-Account-Token ${authorization}` },
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => '');
    throw new Error(`Account deletion failed: ${res.status} ${body}`);
  }
}

async function getAuthenticatedFetch(orgSlug) {
  const email = process.env.CSS_POD_ADMIN_EMAIL;
  const password = process.env.CSS_POD_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('CSS_POD_ADMIN_EMAIL / CSS_POD_ADMIN_PASSWORD not set (check /root/css-pod/.env)');
  }
  const webId = `${podBaseForOrg(orgSlug)}profile/card#me`;
  return getAuthenticatedFetchForCredential(email, password, webId);
}

module.exports = {
  POD_ROOT,
  podBaseForOrg,
  slugify,
  resourceUrlFor,
  createPod,
  getAuthenticatedFetch,
  registerNewPodAccount,
  getAuthenticatedFetchForCredential,
  deleteAccount,
};
