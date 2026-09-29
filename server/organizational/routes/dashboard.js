'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { fetchAttentionFeed } = require('../lib/OrganizationalAttentionFeed');
const { fetchActivityFeed } = require('../lib/OrganizationalActivityFeed');

function registerOrganizationalDashboardRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/dashboard/attention', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const orgId = req.orgId;
    try {
      const out = await fetchAttentionFeed(pool, orgId, slug);
      return res.json(out);
    } catch (e) {
      console.error('dashboard/attention', e);
      return res.status(500).json({ error: 'Could not load attention feed' });
    }
  });

  app.get('/api/organizational/orgs/:slug/dashboard/activity', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const since = req.query.since ? String(req.query.since) : null;
    try {
      const items = await fetchActivityFeed(pool, orgId, since);
      return res.json({ items });
    } catch (e) {
      console.error('dashboard/activity', e);
      return res.status(500).json({ error: 'Could not load activity feed' });
    }
  });

  // Summarizes this org's participation in the cooperative — distinct from the
  // org-financial narrative — so the dashboard can show both Org and Coop summary info.
  app.get('/api/organizational/orgs/:slug/dashboard/cooperative-summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const orgR = await pool.query(`SELECT membership_status FROM coop_members WHERE id = $1`, [orgId]);
      const membershipStatus = orgR.rows[0] ? orgR.rows[0].membership_status : null;

      const workshopsR = await pool.query(
        `SELECT DISTINCT p.id, p.name, p.slug
         FROM cooperative_work_library_items i
         JOIN workshop_projects p ON p.id = i.workshop_id
         WHERE i.source_org_id = $1
         ORDER BY p.name ASC`,
        [orgId]
      );

      const workPoolR = await pool.query(
        `SELECT COUNT(*)::int AS open_count
         FROM cooperative_work_requests
         WHERE org_id = $1 AND status IN ('open', 'in_progress')`,
        [orgId]
      );

      const libraryR = await pool.query(
        `SELECT COUNT(*)::int AS contribution_count
         FROM cooperative_work_library_items
         WHERE source_org_id = $1`,
        [orgId]
      );

      return res.json({
        membership_status: membershipStatus,
        workshops: workshopsR.rows,
        work_pool_open_count: workPoolR.rows[0] ? workPoolR.rows[0].open_count : 0,
        library_contribution_count: libraryR.rows[0] ? libraryR.rows[0].contribution_count : 0,
      });
    } catch (e) {
      console.error('dashboard/cooperative-summary', e);
      return res.status(500).json({ error: 'Could not load cooperative summary' });
    }
  });

  app.post('/api/organizational/orgs/:slug/dashboard/visit', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    try {
      await pool.query(
        `UPDATE org_users
         SET last_dashboard_visit_at = NOW()
         WHERE org_id = $1 AND user_id = $2`,
        [orgId, userId]
      );
      return res.json({ ok: true });
    } catch (e) {
      console.error('dashboard/visit', e);
      return res.status(500).json({ error: 'Could not update visit' });
    }
  });
}

module.exports = { registerOrganizationalDashboardRoutes };
