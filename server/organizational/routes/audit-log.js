'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');

const ALLOWED_TABLES = new Set(['org_budget_lines', 'org_schedule_items', 'org_schedules', 'org_allocation_schedules', 'org_fiscal_year_locks']);
const ALLOWED_ACTIONS = new Set(['create', 'update', 'delete']);

function registerOrganizationalAuditLogRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/audit-log', ...orgAuth, async (req, res) => {
    const orgId  = req.orgId;

    const limit  = Math.min(200, Math.max(1, Number.parseInt(String(req.query.limit  || '50'), 10) || 50));
    const offset = Math.max(0,             Number.parseInt(String(req.query.offset || '0'),  10) || 0);

    const tableFilter  = req.query.table_name && ALLOWED_TABLES.has(req.query.table_name)  ? req.query.table_name  : null;
    const actionFilter = req.query.action     && ALLOWED_ACTIONS.has(req.query.action)     ? req.query.action      : null;

    try {
      const conds  = ['al.org_id = $1'];
      const params = [orgId];
      let p = 2;

      if (tableFilter)  { conds.push(`al.table_name = $${p++}`); params.push(tableFilter); }
      if (actionFilter) { conds.push(`al.action = $${p++}`);     params.push(actionFilter); }

      const where = conds.join(' AND ');

      const [entriesRes, countRes] = await Promise.all([
        pool.query(
          `SELECT al.id, al.action, al.table_name, al.record_id,
                  al.field_name, al.old_value, al.new_value,
                  al.occurred_at, u.email AS user_email
           FROM org_audit_log al
           LEFT JOIN users u ON u.id = al.user_id
           WHERE ${where}
           ORDER BY al.occurred_at DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, limit, offset]
        ),
        pool.query(
          `SELECT COUNT(*)::int AS total FROM org_audit_log al WHERE ${where}`,
          params
        ),
      ]);

      res.json({
        entries: entriesRes.rows,
        total:   countRes.rows[0]?.total || 0,
      });
    } catch (e) {
      console.error('GET /audit-log:', e.message);
      res.status(500).json({ error: 'Could not load audit log' });
    }
  });
}

module.exports = { registerOrganizationalAuditLogRoutes };
