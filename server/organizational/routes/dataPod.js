'use strict';

// Data Pod panel (v1, read-only) API: works for whatever org the viewer is in,
// same as any other Compliance & Reporting route - no per-org allowlist. An org
// whose pod hasn't been provisioned yet (every org created before this shipped,
// since auto-provisioning is deliberately not backfilled) gets a clean
// "not yet provisioned" response, not an error.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { checkOrgPodStatus, syncOrgToPod } = require('../lib/podSync');
const { giveServiceContainerAccess, revokeServiceContainerAccess, hasServiceContainerAccess } = require('../lib/causalSyncService');

async function getPodSettings(pool, orgId) {
  const r = await pool.query(
    `SELECT pod_provisioned, pod_provisioned_at, pod_last_synced_at, pod_provisioning_error
       FROM org_settings WHERE org_id = $1`,
    [orgId]
  );
  return r.rows[0] || { pod_provisioned: false };
}

function registerOrganizationalDataPodRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [...orgAuth, requireOrgRole('admin')];
  const base = '/api/organizational/orgs/:slug/data-pod';

  app.get(`${base}/status`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    try {
      const settings = await getPodSettings(pool, req.orgId);
      if (!settings.pod_provisioned) {
        return res.json({
          provisioned: false,
          provisioningError: settings.pod_provisioning_error || null,
        });
      }

      const { connected, documents } = await checkOrgPodStatus(pool, req.orgId, slug);
      return res.json({
        provisioned: true,
        connected,
        documents,
        lastSync: settings.pod_last_synced_at ? { timestamp: settings.pod_last_synced_at } : null,
      });
    } catch (e) {
      console.error('GET /data-pod/status:', e.message);
      return res.status(502).json({ error: 'Could not reach the data pod.' });
    }
  });

  app.post(`${base}/sync`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    try {
      const settings = await getPodSettings(pool, req.orgId);
      if (!settings.pod_provisioned) {
        return res.status(409).json({ error: 'This organization does not have a pod provisioned yet.' });
      }

      const result = await syncOrgToPod(pool, req.orgId, slug);
      return res.json(result);
    } catch (e) {
      console.error('POST /data-pod/sync:', e.message);
      return res.status(502).json({ error: 'Sync failed to run.' });
    }
  });

  // Whether this org has given Causal's own sync/fetch service permission
  // on its pod (a scoped, revocable ACP permission - see causalSyncService.js) -
  // the "converting held-credential to org-given permission" half of this
  // work. Admin-gated: this is a real security-posture decision, same
  // reasoning as the existing ad-hoc permission routes being admin-only.
  app.get(`${base}/sync-permission`, ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    try {
      const permission = await hasServiceContainerAccess(pool, req.orgId, slug);
      return res.json({ granted: !!permission, canWrite: permission ? permission.can_write : null });
    } catch (e) {
      console.error('GET /data-pod/sync-permission:', e.message);
      return res.status(500).json({ error: 'Could not load sync permission status.' });
    }
  });

  app.post(`${base}/sync-permission`, ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const result = await giveServiceContainerAccess(pool, { orgId: req.orgId, orgSlug: slug, canWrite: true, userId });
      return res.status(201).json(result);
    } catch (e) {
      console.error('POST /data-pod/sync-permission:', e.message);
      return res.status(500).json({ error: e.message || 'Could not add sync permission.' });
    }
  });

  app.delete(`${base}/sync-permission`, ...npAdmin, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    try {
      const result = await revokeServiceContainerAccess(pool, { orgId: req.orgId, orgSlug: slug });
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error('DELETE /data-pod/sync-permission:', e.message);
      return res.status(500).json({ error: 'Could not revoke sync permission.' });
    }
  });
}

module.exports = { registerOrganizationalDataPodRoutes };
