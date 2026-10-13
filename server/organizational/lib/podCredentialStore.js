'use strict';

const { encryptCredential, decryptCredential } = require('./podCredentialCrypto');
const podClient = require('./podClient');

async function storeOrgCredential(pool, orgId, { email, password, webId }) {
  const enc = encryptCredential(password);
  await pool.query(
    `SELECT store_org_pod_credential($1,$2,$3,$4,$5,$6)`,
    [orgId, email, enc.encrypted, enc.iv, enc.authTag, webId]
  );
}

async function resolveOrgCredential(pool, orgId) {
  const r = await pool.query(`SELECT * FROM resolve_org_pod_credential($1)`, [orgId]);
  if (r.rows.length === 0 || !r.rows[0].account_email) return null;
  const row = r.rows[0];
  const password = decryptCredential({
    encrypted: row.encrypted_password,
    iv: row.encryption_iv,
    authTag: row.encryption_auth_tag,
  });
  return { email: row.account_email, password, webId: row.pod_webid };
}

async function getAuthenticatedFetchForOrg(pool, orgId, orgSlug) {
  const cred = await resolveOrgCredential(pool, orgId);
  if (cred) {
    return podClient.getAuthenticatedFetchForCredential(cred.email, cred.password, cred.webId);
  }
  console.warn(`podCredentialStore: org ${orgId} (${orgSlug}) has no dedicated pod credential yet - falling back to the legacy shared admin credential (DevPath rev 55).`);
  return podClient.getAuthenticatedFetch(orgSlug);
}

async function deleteOrgPodAccount(pool, orgId, orgSlug) {
  const cred = await resolveOrgCredential(pool, orgId);
  if (!cred) {
    console.log(`podCredentialStore: org ${orgId} (${orgSlug}) has no dedicated pod credential — nothing to delete (legacy shared-admin org).`);
    return;
  }
  await podClient.deleteAccount(cred.email, cred.password);
}

async function storeCoopCredential(pool, { email, password, webId }) {
  const enc = encryptCredential(password);
  await pool.query(
    `INSERT INTO coop_pod_credentials (id, account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid)
     VALUES (1,$1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET
       account_email = EXCLUDED.account_email,
       encrypted_password = EXCLUDED.encrypted_password,
       encryption_iv = EXCLUDED.encryption_iv,
       encryption_auth_tag = EXCLUDED.encryption_auth_tag,
       pod_webid = EXCLUDED.pod_webid`,
    [email, enc.encrypted, enc.iv, enc.authTag, webId]
  );
}

async function resolveCoopCredential(pool) {
  const r = await pool.query(
    `SELECT account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid
       FROM coop_pod_credentials WHERE id = 1`
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  const password = decryptCredential({
    encrypted: row.encrypted_password,
    iv: row.encryption_iv,
    authTag: row.encryption_auth_tag,
  });
  return { email: row.account_email, password, webId: row.pod_webid };
}

async function getAuthenticatedFetchForCoop(pool) {
  const cred = await resolveCoopCredential(pool);
  if (!cred) throw new Error('Coop pod has not been provisioned yet.');
  return podClient.getAuthenticatedFetchForCredential(cred.email, cred.password, cred.webId);
}

async function storeServiceCredential(pool, { email, password, webId }) {
  const enc = encryptCredential(password);
  await pool.query(
    `INSERT INTO causal_service_credentials (id, account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid)
     VALUES (1,$1,$2,$3,$4,$5)
     ON CONFLICT (id) DO UPDATE SET
       account_email = EXCLUDED.account_email,
       encrypted_password = EXCLUDED.encrypted_password,
       encryption_iv = EXCLUDED.encryption_iv,
       encryption_auth_tag = EXCLUDED.encryption_auth_tag,
       pod_webid = EXCLUDED.pod_webid`,
    [email, enc.encrypted, enc.iv, enc.authTag, webId]
  );
}

async function resolveServiceCredential(pool) {
  const r = await pool.query(
    `SELECT account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid
       FROM causal_service_credentials WHERE id = 1`
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  const password = decryptCredential({
    encrypted: row.encrypted_password,
    iv: row.encryption_iv,
    authTag: row.encryption_auth_tag,
  });
  return { email: row.account_email, password, webId: row.pod_webid };
}

async function getAuthenticatedFetchForService(pool) {
  const cred = await resolveServiceCredential(pool);
  if (!cred) throw new Error("The sync/fetch service identity has not been provisioned yet.");
  return podClient.getAuthenticatedFetchForCredential(cred.email, cred.password, cred.webId);
}

module.exports = {
  storeOrgCredential,
  resolveOrgCredential,
  getAuthenticatedFetchForOrg,
  deleteOrgPodAccount,
  storeCoopCredential,
  resolveCoopCredential,
  getAuthenticatedFetchForCoop,
  storeServiceCredential,
  resolveServiceCredential,
  getAuthenticatedFetchForService,
};
