'use strict';

// Access Groups — pod-sharing lists, deliberately separate from platform
// role management (org_users). Membership can be managed by any org member,
// same as document upload permission itself (documents.js's POST route has
// no role check beyond membership) - there's no narrower per-category
// document-creation permission in this codebase to hook a tighter check to,
// so "anyone with document-creation permission for the category" reduces to
// "any org member" today.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const podAccessGroups = require('../lib/podAccessGroups');

function registerPodAccessGroupRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const base = '/api/organizational/orgs/:slug/access-groups';

  app.get(base, ...orgAuth, async (req, res) => {
    try {
      const groups = await podAccessGroups.listGroups(pool, req.orgId);
      const rules = await podAccessGroups.listRules(pool, req.orgId);
      return res.json({ groups, rules });
    } catch (e) {
      console.error('GET /access-groups:', e.message);
      return res.status(500).json({ error: 'Could not load access groups.' });
    }
  });

  app.post(base, ...orgAuth, async (req, res) => {
    const userId = req.user.user_id ?? req.user.id;
    const name = String((req.body || {}).name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });
    try {
      const group = await podAccessGroups.createGroup(pool, { orgId: req.orgId, name, userId });
      return res.status(201).json({ group });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'A group with this name already exists.' });
      console.error('POST /access-groups:', e.message);
      return res.status(500).json({ error: 'Could not create group.' });
    }
  });

  app.delete(`${base}/:id`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: 'Invalid group id' });
    try {
      const result = await podAccessGroups.deleteGroup(pool, { orgId: req.orgId, orgSlug: slug, groupId });
      return res.json({ ok: true, ...result });
    } catch (e) {
      console.error('DELETE /access-groups/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete group.' });
    }
  });

  app.get(`${base}/:id/members`, ...orgAuth, async (req, res) => {
    const groupId = Number(req.params.id);
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: 'Invalid group id' });
    try {
      const members = await podAccessGroups.listMembers(pool, req.orgId, groupId);
      return res.json({ members });
    } catch (e) {
      console.error('GET /access-groups/:id/members:', e.message);
      return res.status(500).json({ error: 'Could not load members.' });
    }
  });

  app.post(`${base}/:id/members`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const groupId = Number(req.params.id);
    const recipient = String((req.body || {}).recipient || '').trim();
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: 'Invalid group id' });
    if (!recipient) return res.status(400).json({ error: 'recipient (WebID or email) is required' });
    try {
      const member = await podAccessGroups.addMember(pool, { orgId: req.orgId, orgSlug: slug, groupId, recipient, userId });
      return res.status(201).json({ member });
    } catch (e) {
      console.error('POST /access-groups/:id/members:', e.message);
      return res.status(400).json({ error: e.message || 'Could not add member.' });
    }
  });

  app.delete(`${base}/:id/members/:memberId`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const groupId = Number(req.params.id);
    const memberId = Number(req.params.memberId);
    if (!Number.isInteger(groupId) || !Number.isInteger(memberId)) return res.status(400).json({ error: 'Invalid id' });
    try {
      const result = await podAccessGroups.removeMember(pool, { orgId: req.orgId, orgSlug: slug, groupId, memberId });
      if (!result) return res.status(404).json({ error: 'Member not found' });
      return res.json({ ok: true, revokedPermissions: result.revokedPermissions, outboxIds: result.outboxIds });
    } catch (e) {
      console.error('DELETE /access-groups/:id/members/:memberId:', e.message);
      return res.status(500).json({ error: 'Could not remove member.' });
    }
  });

  // Polled by the UI so "Removing/Giving access..." can flip to settled
  // once CSS has actually caught up, not just once the DB write returned -
  // see process-acr-outbox.js. Same non-admin-gated middleware as the rest
  // of this file, since group/rule management itself isn't admin-only.
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
      console.error('GET /access-groups/outbox-status:', e.message);
      return res.status(500).json({ error: 'Could not load status.' });
    }
  });

  // Bulk-sets a group's category coverage to exactly the given list in one
  // request (not N single-category calls): the Standing Rules checklist UI
  // always sends the full desired set, whether this is the first time
  // coverage is being set or an edit to existing coverage - the backend
  // diffs against current rows either way.
  app.put(`${base}/:id/category-rules`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const groupId = Number(req.params.id);
    const categories = Array.isArray((req.body || {}).categories) ? (req.body || {}).categories.map((c) => String(c).trim()).filter(Boolean) : null;
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: 'Invalid group id' });
    if (!categories) return res.status(400).json({ error: 'categories must be an array' });
    try {
      const result = await podAccessGroups.setGroupCategoryRules(pool, { orgId: req.orgId, orgSlug: slug, groupId, categories, userId });
      return res.json(result);
    } catch (e) {
      if (e.code === '23503') return res.status(400).json({ error: 'Invalid category or group.' });
      console.error('PUT /access-groups/:id/category-rules:', e.message);
      return res.status(500).json({ error: 'Could not update rules.' });
    }
  });

  // Single document-scoped rule - used by "Share with Group" in the
  // Documents module (an ongoing, cascading rule, not a one-off permission).
  app.post(`${base}/:id/document-rules`, ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const groupId = Number(req.params.id);
    const documentId = Number((req.body || {}).document_id);
    if (!Number.isInteger(groupId) || groupId < 1) return res.status(400).json({ error: 'Invalid group id' });
    if (!Number.isInteger(documentId) || documentId < 1) return res.status(400).json({ error: 'document_id is required' });
    try {
      const rule = await podAccessGroups.createDocumentRule(pool, { orgId: req.orgId, orgSlug: slug, documentId, groupId, userId });
      if (!rule) return res.status(409).json({ error: 'This group already has a rule for this document.' });
      return res.status(201).json({ rule });
    } catch (e) {
      if (e.code === '23503') return res.status(400).json({ error: 'Invalid document or group.' });
      console.error('POST /access-groups/:id/document-rules:', e.message);
      return res.status(500).json({ error: 'Could not create rule.' });
    }
  });

  app.delete(`${base}/rules/:ruleId`, ...orgAuth, async (req, res) => {
    const ruleId = Number(req.params.ruleId);
    if (!Number.isInteger(ruleId) || ruleId < 1) return res.status(400).json({ error: 'Invalid rule id' });
    try {
      const rule = await podAccessGroups.deleteRule(pool, { orgId: req.orgId, ruleId });
      if (!rule) return res.status(404).json({ error: 'Rule not found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE /access-groups/rules/:ruleId:', e.message);
      return res.status(500).json({ error: 'Could not delete rule.' });
    }
  });
}

module.exports = { registerPodAccessGroupRoutes };
