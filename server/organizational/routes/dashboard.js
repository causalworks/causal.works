'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { requireReadAccess } = require('../middleware/requireWriteAccess');
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
      const out = await fetchAttentionFeed(pool, orgId, slug, req);
      if (req.coopOrgRole === 'admin' || ['finance', 'staff'].includes(req.coopOrgRole)) {
        const sw = await pool.query(
          `SELECT ou.id, u.email, ou.accounting_entry_enabled_at AS since,
                  EXISTS (SELECT 1 FROM org_users f WHERE f.org_id = ou.org_id AND f.role IN ('finance', 'staff')) AS has_finance
             FROM org_users ou JOIN users u ON u.id = ou.user_id
            WHERE ou.org_id = $1 AND ou.role = 'admin' AND ou.accounting_entry_enabled`, [orgId]);
        const settingsHref = `/organizational/o/${encodeURIComponent(slug)}/settings/organization`;
        for (const row of sw.rows) {
          if (!row.has_finance) continue;
          const mine = row.id === req.coopOrgUserId;
          const days = row.since ? Math.floor((Date.now() - new Date(row.since).getTime()) / 86400000) : 0;
          if (mine && days >= 30) {
            out.items.push({ type: 'access', urgency_days: 0, title: `Your accounting entry access has been on for ${days} days: keep it on for 30 more days or turn it off`, due_date: null, href: settingsHref });
          } else if (!mine) {
            out.items.push({ type: 'access', urgency_days: 7, title: `${row.email} has accounting entry access switched on${row.since ? ' since ' + new Date(row.since).toISOString().slice(0, 10) : ''}`, due_date: null, href: settingsHref });
          }
        }
      }
      if (req.coopOrgRole === 'admin') {
        const ending = await pool.query(
          `SELECT p.id, p.permission, p.ends_at, u.email
             FROM org_access_permissions p
             JOIN org_users ou ON ou.id = p.org_user_id
             JOIN users u ON u.id = ou.user_id
            WHERE p.org_id = $1 AND p.revoked_at IS NULL AND p.ends_at IS NOT NULL
              AND p.ends_at > now() AND p.ends_at <= now() + interval '3 days'
            ORDER BY p.ends_at`, [orgId]);
        const labels = { reports: 'Reports', accounting_read: 'All Accounting (read-only)' };
        for (const row of ending.rows) {
          const days = Math.max(0, Math.ceil((new Date(row.ends_at) - Date.now()) / 86400000));
          out.items.push({
            type: 'access',
            urgency_days: days,
            title: `${row.email}'s ${labels[row.permission] || row.permission} access ends ${new Date(row.ends_at).toISOString().slice(0, 10)}`,
            due_date: new Date(row.ends_at).toISOString().slice(0, 10),
            href: `/organizational/o/${encodeURIComponent(slug)}/settings/organization`,
          });
        }
        out.items.sort((x, y) => Number(x.urgency_days || 999) - Number(y.urgency_days || 999));
      }
      return res.json(out);
    } catch (e) {
      console.error('dashboard/attention', e);
      return res.status(500).json({ error: 'Could not load attention feed' });
    }
  });

  app.get('/api/organizational/orgs/:slug/dashboard/activity', ...orgAuth, requireReadAccess('activity_feed'), boardSeesAllPrograms, async (req, res) => {
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
