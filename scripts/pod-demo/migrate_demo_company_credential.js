#!/usr/bin/env node
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const crypto = require('crypto');
const { Pool } = require('pg');
const { getAuthenticatedFetchForCredential, registerNewPodAccount } = require('../../server/organizational/lib/podClient');
const { storeOrgCredential, resolveOrgCredential } = require('../../server/organizational/lib/podCredentialStore');

const ORG_ID = 42;
const ORG_SLUG = 'demo-company';
const POD_ROOT = process.env.POD_ROOT_OVERRIDE || 'https://data.causal.works/';
const WEB_ID = `${POD_ROOT}${ORG_SLUG}/profile/card#me`;
const PROFILE_URL = `${POD_ROOT}${ORG_SLUG}/profile/card`;

async function accountFetch(url, opts, authorization) {
  const headers = { ...(opts.headers || {}) };
  if (opts.body) headers['content-type'] = 'application/json';
  if (authorization) headers.authorization = `CSS-Account-Token ${authorization}`;
  const res = await fetch(url, { ...opts, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`${opts.method || 'GET'} ${url} -> ${res.status}: ${JSON.stringify(body)}`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

async function main() {
  const accountBase = `${new URL(POD_ROOT).origin}/.account/`;
  const recoveryCred = JSON.parse(require('fs').readFileSync('/tmp/recovery-account.json', 'utf8'));

  console.log(`Migrating ${ORG_SLUG} (org ${ORG_ID}), attempt 2, using recovery access...`);

  const created = await accountFetch(`${accountBase}account/`, { method: 'POST' });
  const newAuthorization = created.authorization;
  const newAcc = await accountFetch(accountBase, { method: 'GET' }, newAuthorization);
  const email = `pod-${ORG_SLUG}-v2@internal.causal.works`;
  const password = crypto.randomBytes(24).toString('base64url');
  await accountFetch(newAcc.controls.password.create, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  }, newAuthorization);
  console.log(`1. New dedicated account created: ${email}`);
  const verifyLogin = await accountFetch(`${accountBase}login/password/`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!verifyLogin.authorization) throw new Error('Step 1 verification failed: new account cannot log in.');
  console.log('   VERIFIED: new account logs in successfully.');

  let challenge;
  try {
    await accountFetch(newAcc.controls.account.webId, {
      method: 'POST',
      body: JSON.stringify({ webId: WEB_ID }),
    }, newAuthorization);
    throw new Error('Link succeeded immediately without a verification challenge - unexpected state, aborting.');
  } catch (err) {
    if (err.status !== 400 || !err.body?.details?.quad) throw err;
    challenge = err.body;
  }
  const tokenMatch = challenge.details.quad.match(/"([^"]+)"/);
  if (!tokenMatch) throw new Error(`Could not parse verification token from challenge: ${JSON.stringify(challenge)}`);
  const token = tokenMatch[1];
  console.log(`2. Verification challenge received, token: ${token}`);

  const recoveryFetch = await getAuthenticatedFetchForCredential(recoveryCred.email, recoveryCred.password, recoveryCred.webId);
  const patchRes = await recoveryFetch(PROFILE_URL, {
    method: 'PATCH',
    headers: { 'content-type': 'application/sparql-update' },
    body: `INSERT DATA { <${WEB_ID}> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "${token}" . }`,
  });
  if (!patchRes.ok) throw new Error(`Failed to add verification triple: ${patchRes.status} ${await patchRes.text()}`);
  console.log('3. Verification triple added to profile document (via recovery access).');
  const verifyRead = await recoveryFetch(PROFILE_URL, { headers: { accept: 'text/turtle' } });
  const verifyText = await verifyRead.text();
  if (!verifyText.includes(token)) throw new Error('Step 3 verification failed: token not found in profile document after PATCH.');
  console.log('   VERIFIED: token present in profile document.');

  const linkResult = await accountFetch(newAcc.controls.account.webId, {
    method: 'POST',
    body: JSON.stringify({ webId: WEB_ID }),
  }, newAuthorization);
  console.log('4. New account linked to WebID:', linkResult.webId === WEB_ID ? 'confirmed same WebID' : '*** MISMATCH ***');

  const cleanupRes = await recoveryFetch(PROFILE_URL, {
    method: 'PATCH',
    headers: { 'content-type': 'application/sparql-update' },
    body: `DELETE DATA { <${WEB_ID}> <http://www.w3.org/ns/solid/terms#oidcIssuerRegistrationToken> "${token}" . }`,
  });
  if (!cleanupRes.ok) console.warn(`Warning: could not remove verification triple (non-fatal): ${cleanupRes.status}`);
  else console.log('   Verification triple removed.');

  const newCredFetch = await getAuthenticatedFetchForCredential(email, password, WEB_ID);
  const newCredRead = await newCredFetch(`${POD_ROOT}${ORG_SLUG}/documents/board_resolution/9-board-resolution-fy2026-budget-approval.txt`);
  if (newCredRead.status !== 200) throw new Error(`Step 5 verification failed: new credential cannot read a real document (status ${newCredRead.status}).`);
  console.log('5. VERIFIED: new dedicated credential can authenticate and read real pod content.');

  const pool = new Pool({
    user: process.env.DB_USER, host: process.env.DB_HOST, database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD, port: process.env.DB_PORT,
  });
  await storeOrgCredential(pool, ORG_ID, { email, password, webId: WEB_ID });
  const resolved = await resolveOrgCredential(pool, ORG_ID);
  await pool.end();
  if (!resolved || resolved.email !== email) throw new Error('Step 6 verification failed: stored credential does not resolve correctly.');
  console.log('6. VERIFIED: credential stored and resolves correctly from Postgres.');

  console.log('\nMigration complete and verified at every step.');
}

main().catch((err) => {
  console.error('MIGRATION FAILED:', err.message);
  process.exit(1);
});
