'use strict';

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

  app.get(`${base}/status`, ...npAdmin, async (req, res) => {
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

  app.post(`${base}/sync`, ...npAdmin, async (req, res) => {
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
