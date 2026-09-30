'use strict';

// Coop-wide Pod Management (platform-admin only): lists every org's pod status
// in one view and can trigger a sync across all provisioned orgs. Deliberately
// NOT under /organizational/o/:slug/ - this spans every org, so it can't be
// gated by any single org's membership/role (see requirePlatformAdmin.js).

const { requireAuth } = require('../../auth');
const { requirePlatformAdmin } = require('../middleware/requirePlatformAdmin');
const { enterOrgContext } = require('../lib/orgContext');
const { syncOrgToPod } = require('../lib/podSync');
const { resolveCoopCredential, resolveServiceCredential } = require('../lib/podCredentialStore');
const { provisionCoopPod, syncCoopLibraryToPod, coopPodBase } = require('../lib/coopPod');
const { provisionCausalSyncService } = require('../lib/causalSyncService');

function registerPodManagementRoutes(app, pool) {
  const gated = [requireAuth(pool), requirePlatformAdmin];

  app.get('/api/organizational/cooperative/pod-management', ...gated, async (req, res) => {
    try {
      const r = await pool.query(`SELECT * FROM admin_list_orgs_with_pod_status()`);
      const coopCred = await resolveCoopCredential(pool);
      const serviceCred = await resolveServiceCredential(pool);
      return res.json({
        orgs: r.rows,
        coopPod: { provisioned: !!coopCred, podUrl: coopCred ? coopPodBase() : null },
        syncService: { provisioned: !!serviceCred, webId: serviceCred ? serviceCred.webId : null },
      });
    } catch (e) {
      console.error('GET /cooperative/pod-management:', e.message);
      return res.status(500).json({ error: 'Could not load pod management data.' });
    }
  });

  app.post('/api/organizational/cooperative/pod-management/coop-pod/provision', ...gated, async (req, res) => {
    try {
      const result = await provisionCoopPod(pool);
      return res.json(result);
    } catch (e) {
      console.error('POST /cooperative/pod-management/coop-pod/provision:', e.message);
      return res.status(500).json({ error: 'Could not provision coop pod.' });
    }
  });

  app.post('/api/organizational/cooperative/pod-management/coop-pod/sync', ...gated, async (req, res) => {
    try {
      const result = await syncCoopLibraryToPod(pool);
      return res.json(result);
    } catch (e) {
      console.error('POST /cooperative/pod-management/coop-pod/sync:', e.message);
      return res.status(500).json({ error: e.message || 'Could not sync coop library to pod.' });
    }
  });

  app.post('/api/organizational/cooperative/pod-management/sync-service/provision', ...gated, async (req, res) => {
    try {
      const result = await provisionCausalSyncService(pool);
      return res.json(result);
    } catch (e) {
      console.error('POST /cooperative/pod-management/sync-service/provision:', e.message);
      return res.status(500).json({ error: "Could not provision the platform's sync service identity." });
    }
  });

  app.post('/api/organizational/cooperative/pod-management/sync-all', ...gated, async (req, res) => {
    try {
      const orgsR = await pool.query(`SELECT * FROM admin_list_orgs_with_pod_status()`);
      const provisioned = orgsR.rows.filter((o) => o.pod_provisioned);

      const results = [];
      // Sequential, not parallel - keeps load on the single CSS instance predictable
      // and keeps error attribution per-org unambiguous in the response.
      for (const org of provisioned) {
        enterOrgContext(org.org_id);
        try {
          const result = await syncOrgToPod(pool, org.org_id, org.slug);
          results.push({ orgId: org.org_id, slug: org.slug, ok: true, ...result });
        } catch (e) {
          console.error(`sync-all: failed for org ${org.org_id} (${org.slug}):`, e.message);
          results.push({ orgId: org.org_id, slug: org.slug, ok: false, error: e.message });
        }
      }

      return res.json({
        orgsAttempted: provisioned.length,
        orgsSucceeded: results.filter((r) => r.ok).length,
        results,
      });
    } catch (e) {
      console.error('POST /cooperative/pod-management/sync-all:', e.message);
      return res.status(500).json({ error: 'Sync-all failed to run.' });
    }
  });
}

module.exports = { registerPodManagementRoutes };
