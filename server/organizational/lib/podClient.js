'use strict';

// Solid pod client: CSS account/pod-creation + client-credentials/DPoP auth.
// Pure protocol layer - no DB access, no knowledge of "which org." Credential
// resolution (which email/password to use for a given org) lives in
// podCredentialStore.js, which calls into this file's *ForCredential functions.
//
// All pods live under one shared domain, path-scoped per org: POD_ROOT/<org-slug>/
// (CSS's standard multi-tenant mode).
//
// AUTH MODEL (DevPath rev 55 - being migrated off the model below):
// New orgs are provisioned via registerNewPodAccount() - a brand-new, dedicated
// CSS account (anonymous self-registration, no privileged bootstrap step) that
// creates and owns its own pod from the moment it exists. There is no "shared
// admin creates it then hands off" step for new orgs - self-registration means
// the shared admin is never involved at all. Verified live: CSS itself refuses
// to mint client credentials for a WebID not linked to the requesting account
// ("WebID does not belong to this account", straight from CSS's own handler) -
// this is real protocol-level isolation, not an app-level convention.
//
// loginToAccount()/createPod()/getAuthenticatedFetch() (the single-arg legacy
// versions below) are the ORIGINAL shared-fixed-admin-credential path
// (CSS_POD_ADMIN_EMAIL/PASSWORD). Kept only as a fallback for orgs not yet
// migrated to a dedicated credential (currently: demo-company, pending a
// dry-run-verified migration - see DevPath rev 55) and for the standalone
// scripts/pod-demo/*.js CLI tools. Do not add new call sites against it.

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

// Logs in with the GIVEN credentials (any account - dedicated org account,
// coop account, or the legacy shared admin). Returns the account's control
// links plus a CSS-Account-Token authorization value for further account-API calls.
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

// LEGACY: logs in with the fixed shared admin credential. Fallback path only -
// see file header. Do not add new call sites.
async function loginToAccount() {
  const email = process.env.CSS_POD_ADMIN_EMAIL;
  const password = process.env.CSS_POD_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('CSS_POD_ADMIN_EMAIL / CSS_POD_ADMIN_PASSWORD not set (check /root/css-pod/.env)');
  }
  return loginWithCredential(email, password);
}

// Creates a genuinely new, dedicated, isolated CSS account (anonymous
// self-registration - no existing session or privileged account involved at
// all) that creates and owns its own pod named `slug` from the moment it
// exists. This is the primary provisioning path going forward (new orgs, the
// coop pod) - there is no "shared admin creates then hands off" step here.
// `emailPrefix` lets callers distinguish org vs coop accounts in the CSS
// account list (e.g. "pod-demo-company", "pod-coop").
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

// LEGACY: creates a pod under the fixed shared admin account. Fallback path
// only - see file header. Idempotent in practice (409 if it already exists).
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

// Confirms `webId` is actually linked to this account before minting
// credentials for it. Matters less now that each org has its own dedicated
// credential (no more "wrong org, same account" mixups possible) but kept as
// defense-in-depth - CSS itself enforces this too (confirmed live: minting
// credentials for an unlinked WebID gets a hard 400, "WebID does not belong
// to this account"), so this just fails a little earlier/clearer on our side.
async function verifyWebIdBelongsToAccount(authorization, account, webId) {
  const webIdLink = account.controls?.account?.webId;
  const webIdInfo = await accountFetch(webIdLink, { method: 'GET' }, authorization);
  if (!Object.prototype.hasOwnProperty.call(webIdInfo.webIdLinks || {}, webId)) {
    throw new Error(`WebID ${webId} is not linked to this CSS account - was its pod actually created under this account?`);
  }
}

// Exchanges client_id/client_secret for a DPoP-bound access token scoped to
// `webId`, using the GIVEN account credentials (not the shared admin), then
// returns a `fetch` wrapper that attaches the Authorization + DPoP headers
// CSS requires on every authenticated request. This is the credential-agnostic
// core - callers (podCredentialStore.js) resolve which email/password/webId to
// pass in for a given org/coop.
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

// Deletes a dedicated org's own CSS account entirely (and, per CSS's own cascade, the pod that
// account owns) — the counterpart registerNewPodAccount() never had. Logs in AS the org's own
// account (not the shared admin) so this only ever affects that one org's account, never the
// shared admin account or another org's. CSS exposes the account's own resource for this under
// controls.html.account.account (not controls.account.account, despite the name — verified live
// against this server), deletable via a plain DELETE with the account's own CSS-Account-Token.
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

// LEGACY: same as getAuthenticatedFetchForCredential, but always uses the
// fixed shared admin credential and derives webId from the naming convention.
// Fallback path only - see file header.
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
