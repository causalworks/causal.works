'use strict';

// Resolves which Solid pod credential to use for a given org (or the coop
// pod), decrypting from org_pod_credentials/coop_pod_credentials. This is the
// one place that bridges podClient.js (pure protocol layer, no DB) and the
// DB-backed encrypted credential storage (migration 175, DevPath rev 55).
//
// Falls back to the legacy shared admin credential when an org has no
// dedicated row yet - this is the transitional state every pre-existing org
// is in until migrated; new orgs never hit this fallback since provisioning
// now always creates a dedicated credential from the start.
//
// Org read/write goes through SECURITY DEFINER SQL functions (migration 177),
// not direct table access - org_pod_credentials has FORCE RLS, but org_id
// here is always an explicit, already-trusted input (never derived from an
// ambient session), so there's no real isolation reason to depend on
// app.current_org_id being set. This is a structural fix, not incidental:
// forgetting to enter org context before touching this table caused a real
// incident during the demo-company migration (DevPath rev 56) - the third
// occurrence of that exact bug shape this session. Bypassing RLS here removes
// the dependency on remembering that at every call site, rather than hoping
// the next one gets it right.

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

// Deletes an org's dedicated CSS account (and the pod it owns) when the org itself is
// hard-deleted — the gap that left orphaned Solid accounts behind every time a workspace was
// deleted (found 2026-09-25, fixed 2026-09-27; called from server/jobs/purge-deleted-orgs.js).
// A no-op (not an error) when the org has no dedicated credential — orgs still on the legacy
// shared-admin fallback (podClient.getAuthenticatedFetch) share that one account across every
// such org, so there is nothing org-specific to delete, and deleting the shared admin account
// itself would break every org still depending on it.
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

// Causal's own stable sync/fetch service identity (migration 187) -
// deliberately separate from the coop pod's credential (see that migration's
// comment). Same singleton pattern, no RLS on this table either (no org_id -
// there's exactly one of these, platform-wide).
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
