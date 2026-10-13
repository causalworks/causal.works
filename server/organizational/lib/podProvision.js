'use strict';

const { registerNewPodAccount } = require('./podClient');
const { storeOrgCredential } = require('./podCredentialStore');

async function provisionPodForOrg(pool, orgId, orgSlug) {
  const existing = await pool.query(
    `SELECT pod_provisioned FROM org_settings WHERE org_id = $1`,
    [orgId]
  );
  if (existing.rows[0]?.pod_provisioned) {
    return { ok: true, alreadyProvisioned: true };
  }

  try {
    const { email, password, webId, podUrl } = await registerNewPodAccount(orgSlug, `pod-${orgSlug}`);

    try {
      await storeOrgCredential(pool, orgId, { email, password, webId });
    } catch (storeErr) {
      throw new Error(`Pod created but credential storage failed (pod is now orphaned): ${storeErr.message}`);
    }

    const updateR = await pool.query(
      `UPDATE org_settings
          SET pod_provisioned = true, pod_provisioned_at = now(), pod_provisioning_error = NULL
        WHERE org_id = $1
        RETURNING org_id`,
      [orgId]
    );
    if (updateR.rowCount === 0) {
      console.error(`podProvision: pod created for org ${orgId} (${orgSlug}) but org_settings has no row to update - state is now inconsistent (CSS pod exists, DB says not provisioned).`);
      return { ok: false, error: 'org_settings row missing - pod created but not recorded', podUrl };
    }
    return { ok: true, podUrl };
  } catch (err) {
    console.error(`podProvision: failed for org ${orgId} (${orgSlug}):`, err.message);
    try {
      await pool.query(
        `UPDATE org_settings SET pod_provisioning_error = $2 WHERE org_id = $1`,
        [orgId, String(err.message || err).slice(0, 2000)]
      );
    } catch (loggingErr) {
      console.error('podProvision: could not record provisioning error:', loggingErr.message);
    }
    return { ok: false, error: err.message };
  }
}

module.exports = { provisionPodForOrg };
