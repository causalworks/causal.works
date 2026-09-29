'use strict';

// Auto-provisions a Solid pod for a newly created org. Called after org creation
// commits (server/organizational/routes/orgs.js) - a pod-provisioning failure
// must never fail org creation itself, so this always resolves, never throws;
// callers just check the returned `ok` flag if they want to log/report it.
//
// DevPath rev 55: every new org gets its OWN dedicated, isolated CSS account
// (registerNewPodAccount() - anonymous self-registration, no shared admin
// involvement at all) rather than a pod under the old shared fixed admin
// credential. The credential is encrypted and stored per-org
// (org_pod_credentials) immediately, before org_settings is marked
// provisioned - if credential storage fails, provisioning is reported as
// failed even though the CSS-side pod exists, since an unrecorded credential
// means the pod is orphaned (nothing else can ever authenticate as it).
//
// Idempotent via org_settings.pod_provisioned: never re-run for an org that's
// already true, and a failed attempt leaves it false (with the error recorded)
// so a later retry - manual, for now - is safe to just call this again.

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
      // The CSS-side account+pod now exist but nothing can ever authenticate as
      // them if this credential never gets recorded - treat as a hard failure,
      // not a partial success, even though createPod-equivalent work succeeded.
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
      // The pod itself was created successfully in CSS above, but there's no
      // org_settings row for this org to record that against - every org
      // created through the real signup flow (orgs.js) gets one in the same
      // transaction as coop_members, so this means orgId didn't come from
      // that flow (e.g. inserted directly via SQL). Surfacing loudly rather
      // than silently returning ok:true with a state that doesn't match reality.
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
