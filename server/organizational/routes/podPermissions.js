'use strict';

// Scoped, expiring ACP access permissions — admin-only (this hands a real
// external party read access to a real document, not something a regular
// staff role should be able to do unsupervised).

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { createPermission, revokePermission } = require('../lib/podPermissions');

function registerPodPermissionRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];
  const base = '/api/organizational/orgs/:slug/data-pod/permissions';

  app.get(base, ...orgAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT p.id, p.org_document_id, p.resource_url, p.recipient_label, p.recipient_webid,
                p.recipient_profile_url, p.share_resource_url, p.share_token, p.expires_at, p.revoked_at, p.revoked_reason, p.created_at,
                (SELECT count(*)::int FROM pod_share_challenges c WHERE c.permission_id = p.id AND c.verified_at IS NOT NULL) AS verified_opens,
                d.title AS document_title, d.category AS document_category
           FROM pod_access_permissions p
           JOIN org_documents d ON d.id = p.org_document_id
          WHERE p.org_id = $1
          ORDER BY p.created_at DESC`,
        [req.orgId]
      );
      return res.json({ permissions: r.rows });
    } catch (e) {
      console.error('GET /data-pod/permissions:', e.message);
      return res.status(500).json({ error: 'Could not load permissions.' });
    }
  });

  app.post(base, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const { org_document_id, recipient, expires_at } = req.body || {};

    const orgDocumentId = Number(org_document_id);
    if (!Number.isInteger(orgDocumentId) || orgDocumentId < 1) {
      return res.status(400).json({ error: 'org_document_id is required' });
    }
    if (!recipient || typeof recipient !== 'string' || !recipient.trim()) {
      return res.status(400).json({ error: 'recipient (WebID or email) is required' });
    }
    const expiresAt = new Date(expires_at);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
      return res.status(400).json({ error: 'expires_at must be a valid future date/time' });
    }

    try {
      const permission = await createPermission(pool, {
        orgId: req.orgId,
        orgSlug: slug,
        orgDocumentId,
        recipient: recipient.trim(),
        expiresAt: expiresAt.toISOString(),
        userId,
      });
      return res.status(201).json({ permission });
    } catch (e) {
      console.error('POST /data-pod/permissions:', e.message);
      return res.status(400).json({ error: e.message || 'Could not create permission.' });
    }
  });

  // Polled by the UI to distinguish "DB says revoked/added" (the request
  // already returned) from "CSS has actually caught up" (the outbox row's
  // async .acr rebuild is done) - see process-acr-outbox.js.
  app.get(`${base}/outbox-status`, ...orgAuth, async (req, res) => {
    const ids = String(req.query.ids || '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return res.json({ rows: [] });
    try {
      const r = await pool.query(
        `SELECT id, status, last_error FROM pod_acr_outbox WHERE org_id = $1 AND id = ANY($2::int[])`,
        [req.orgId, ids]
      );
      return res.json({ rows: r.rows });
    } catch (e) {
      console.error('GET /data-pod/permissions/outbox-status:', e.message);
      return res.status(500).json({ error: 'Could not load status.' });
    }
  });

  app.post(`${base}/:id/revoke`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const permissionId = Number(req.params.id);
    if (!Number.isInteger(permissionId) || permissionId < 1) {
      return res.status(400).json({ error: 'Invalid permission id' });
    }
    try {
      const permission = await revokePermission(pool, { orgId: req.orgId, orgSlug: slug, permissionId, reason: 'manual' });
      if (!permission) return res.status(404).json({ error: 'Permission not found or already revoked.' });
      return res.json({ permission });
    } catch (e) {
      console.error('POST /data-pod/permissions/:id/revoke:', e.message);
      return res.status(500).json({ error: 'Could not revoke permission.' });
    }
  });
}

module.exports = { registerPodPermissionRoutes };
