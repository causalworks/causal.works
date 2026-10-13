'use strict';

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

async function giveServiceContainerAccess(pool, { orgId, orgSlug, canWrite, userId }) {
  const cred = await resolveServiceCredential(pool);
  if (!cred) throw new Error("The sync/fetch service identity has not been provisioned yet.");

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
