'use strict';

// Causal's own sync/fetch service identity - the "converting held-credential
// to org-given permission" half of the per-user-identity work. Instead of
// Causal holding a standing, unscoped credential on every org's pod (the
// original model), a single, stable, self-registered CSS identity acts as
// the requester, and each org explicitly gives (and can revoke) that
// identity a scoped, container-level permission on its own pod - the same
// ACP permission mechanism already built for external parties, generalized.
//
// The service identity gets its own (unused) pod as a side effect of
// self-registration - CSS's account API always creates one together - but
// nothing is ever stored there; this identity only ever acts as a permission
// recipient on OTHER orgs' pods, never as an owner of its own content.

const { podBaseForOrg, registerNewPodAccount } = require('./podClient');
const { storeServiceCredential, resolveServiceCredential, getAuthenticatedFetchForService } = require('./podCredentialStore');
const { rebuildResourceAcr } = require('./podPermissions');

const SERVICE_SLUG = 'causal-sync-service';

async function provisionCausalSyncService(pool) {
  const existing = await resolveServiceCredential(pool);
  if (existing) return { ok: true, alreadyProvisioned: true, webId: existing.webId };

  try {
    const { email, password, webId } = await registerNewPodAccount(SERVICE_SLUG, SERVICE_SLUG);
    await storeServiceCredential(pool, { email, password, webId });
    return { ok: true, webId };
  } catch (err) {
    console.error('causalSyncService: provisioning failed:', err.message);
    return { ok: false, error: err.message };
  }
}

// The one container permission an org gives: read+write on its own documents/
// root, targeting the service identity's WebID - confirmed live to cascade
// correctly through every nested category subcontainer, so this single row
// covers sync's entire write surface with no per-category permission needed.
async function giveServiceContainerAccess(pool, { orgId, orgSlug, canWrite, userId }) {
  const cred = await resolveServiceCredential(pool);
  if (!cred) throw new Error("Causal's sync/fetch service identity has not been provisioned yet.");

  const containerUrl = `${podBaseForOrg(orgSlug)}documents/`;
  const existing = await pool.query(
    `SELECT id FROM pod_access_permissions WHERE org_id = $1 AND resource_url = $2 AND recipient_webid = $3 AND revoked_at IS NULL`,
    [orgId, containerUrl, cred.webId]
  );
  if (existing.rows.length > 0) {
    await pool.query(`UPDATE pod_access_permissions SET can_write = $2 WHERE id = $1`, [existing.rows[0].id, !!canWrite]);
  } else {
    await pool.query(
      `INSERT INTO pod_access_permissions
         (org_id, org_document_id, resource_url, recipient_label, recipient_webid, expires_at, is_container, can_write, created_by_user_id)
       VALUES ($1, NULL, $2, 'Causal sync/fetch service', $3, NULL, TRUE, $4, $5)`,
      [orgId, containerUrl, cred.webId, !!canWrite, userId]
    );
  }
  await rebuildResourceAcr(pool, orgId, orgSlug, containerUrl);
  return { given: true, containerUrl };
}

async function revokeServiceContainerAccess(pool, { orgId, orgSlug }) {
  const cred = await resolveServiceCredential(pool);
  if (!cred) return { revoked: 0 };

  const containerUrl = `${podBaseForOrg(orgSlug)}documents/`;
  const r = await pool.query(
    `UPDATE pod_access_permissions
        SET revoked_at = now(), revoked_reason = 'manual'
      WHERE org_id = $1 AND resource_url = $2 AND recipient_webid = $3 AND revoked_at IS NULL
      RETURNING id`,
    [orgId, containerUrl, cred.webId]
  );
  if (r.rows.length > 0) {
    await rebuildResourceAcr(pool, orgId, orgSlug, containerUrl);
  }
  return { revoked: r.rows.length };
}

async function hasServiceContainerAccess(pool, orgId, orgSlug) {
  const cred = await resolveServiceCredential(pool);
  if (!cred) return false;
  const containerUrl = `${podBaseForOrg(orgSlug)}documents/`;
  const r = await pool.query(
    `SELECT can_write FROM pod_access_permissions WHERE org_id = $1 AND resource_url = $2 AND recipient_webid = $3 AND revoked_at IS NULL`,
    [orgId, containerUrl, cred.webId]
  );
  return r.rows[0] || null;
}

// Authenticated fetch AS the service identity - used by sync/fetch-on-
// download instead of the org's own owned credential (getAuthenticatedFetchForOrg).
// No fallback: if the service identity has no credential yet, this throws -
// there is deliberately no path back to a standing org-owned credential.
async function getAuthenticatedFetchForSyncService(pool) {
  return getAuthenticatedFetchForService(pool);
}

module.exports = {
  SERVICE_SLUG,
  provisionCausalSyncService,
  giveServiceContainerAccess,
  revokeServiceContainerAccess,
  hasServiceContainerAccess,
  getAuthenticatedFetchForSyncService,
};
