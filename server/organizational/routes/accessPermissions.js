'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { hasAccountingAccess, hasDonorAccess, hasFunderAccess, adminEntryState } = require('../middleware/requireAccountingAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { canWrite, canRead, AREAS, READ_AREAS, boardApproverAllowed } = require('../middleware/requireWriteAccess');

const READ_PERMISSIONS = ['reports', 'accounting_read', 'donor_details'];
const MANAGER_PERMISSIONS = ['manage_budget', 'manage_personnel', 'manage_funding', 'manage_compliance', 'manage_sponsorship', 'manage_structure', 'manage_donors', 'manage_membership'];
const PERMISSIONS = [...READ_PERMISSIONS, ...MANAGER_PERMISSIONS];
const FULL_ACCESS_ROLES = ['admin', ...FINANCE_ROLES];
const AUDIT_FIELDS = ['org_user_id', 'permission', 'reason', 'ends_at', 'revoked_at'];

function registerAccessPermissionRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const adminOnly = [...orgAuth, requireOrgRole('admin')];
  const base = '/api/organizational/orgs/:slug';

  async function givingRules(orgId) {
    const r = await pool.query(
      `SELECT finance_can_give_access, finance_giveable_permissions FROM org_settings WHERE org_id = $1`, [orgId]);
    const row = r.rows[0] || {};
    return { financeCanGive: !!row.finance_can_give_access, giveable: row.finance_giveable_permissions || [] };
  }

  async function givablePermissions(req) {
    if (req.coopOrgRole === 'admin') return PERMISSIONS;
    if (FINANCE_ROLES.includes(req.coopOrgRole)) {
      const rules = await givingRules(req.orgId);
      return rules.financeCanGive ? rules.giveable.filter((p) => READ_PERMISSIONS.includes(p)) : [];
    }
    return [];
  }

  const canManage = async (req, res, next) => {
    try {
      const mine = await givablePermissions(req);
      if (!mine.length) return res.status(403).json({ error: 'Only an admin can give access, unless an admin has allowed finance to.' });
      req.givablePermissions = mine;
      return next();
    } catch (e) {
      console.error('access permissions canManage:', e.message);
      return res.status(500).json({ error: 'Could not check your permission to give access' });
    }
  };

  const publicRow = (r) => ({
    id: r.id, org_user_id: r.org_user_id, permission: r.permission, reason: r.reason,
    ends_at: r.ends_at, ongoing: r.ends_at == null, created_at: r.created_at, renewed_at: r.renewed_at,
    revoked_at: r.revoked_at, given_by: r.given_by_email || null,
    active: r.revoked_at == null && (r.ends_at == null || new Date(r.ends_at) > new Date()),
  });

  app.get(`${base}/my-access`, ...orgAuth, async (req, res) => {
    try {
      const rows = await pool.query(
        `SELECT id, permission, ends_at FROM org_access_permissions
          WHERE org_user_id = $1 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now()) ORDER BY permission`,
        [req.coopOrgUserId]);
      const admins = await pool.query(
        `SELECT u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.role = 'admin' ORDER BY ou.id LIMIT 3`,
        [req.orgId]);
      const givable = await givablePermissions(req);
      const entry = req.coopOrgRole === 'admin' ? await adminEntryState(pool, req.coopOrgUserId) : { canEnter: false, entryOn: false, hasFinance: false };
      return res.json({
        role: req.coopOrgRole,
        can_write_accounting: FINANCE_ROLES.includes(req.coopOrgRole) || (req.coopOrgRole === 'admin' && entry.canEnter),
        accounting_entry_switch: req.coopOrgRole === 'admin' ? { enabled: entry.entryOn, has_finance_members: entry.hasFinance } : null,
        can_read_accounting: hasAccountingAccess(req, 'accounting_read'),
        can_read_reports: hasAccountingAccess(req, 'reports'),
        can_read_contacts: hasDonorAccess(req),
        can_read_funders: hasFunderAccess(req),
        permissions: rows.rows.map((x) => ({ id: x.id, permission: x.permission, ends_at: x.ends_at, ongoing: x.ends_at == null })),
        write: Object.fromEntries(Object.keys(AREAS).map((a) => [a, canWrite(req, a)])),
        read: Object.fromEntries(Object.keys(READ_AREAS).map((a) => [a, canRead(req, a)])),
        write_who: Object.fromEntries(Object.entries(AREAS).map(([k, v]) => [k, v.who])),
        board_may_approve: await boardApproverAllowed(pool, req.orgId),
        can_give_access: givable.length > 0,
        givable_permissions: givable,
        admins: admins.rows.map((x) => x.email),
      });
    } catch (e) {
      console.error('GET /my-access:', e.message);
      return res.status(500).json({ error: 'Could not load your access' });
    }
  });

  app.get(`${base}/access-permissions`, ...orgAuth, canManage, async (req, res) => {
    try {
      const members = await pool.query(
        `SELECT ou.id AS org_user_id, ou.role::text AS role, u.email FROM org_users ou JOIN users u ON u.id = ou.user_id
          WHERE ou.org_id = $1 ORDER BY u.email`, [req.orgId]);
      const perms = await pool.query(
        `SELECT p.*, gu.email AS given_by_email FROM org_access_permissions p LEFT JOIN users gu ON gu.id = p.given_by_user_id
          WHERE p.org_id = $1 AND (p.revoked_at IS NULL OR p.revoked_at > now() - interval '90 days')
          ORDER BY p.created_at DESC`, [req.orgId]);
      const rules = await givingRules(req.orgId);
      const byUser = new Map();
      for (const p of perms.rows) { if (!byUser.has(p.org_user_id)) byUser.set(p.org_user_id, []); byUser.get(p.org_user_id).push(publicRow(p)); }
      return res.json({
        givable_permissions: req.givablePermissions,
        finance_can_give_access: rules.financeCanGive, finance_giveable_permissions: rules.giveable,
        members: members.rows.map((m) => ({
          org_user_id: m.org_user_id, email: m.email, role: m.role,
          has_full_access: FULL_ACCESS_ROLES.includes(m.role),
          permissions: byUser.get(m.org_user_id) || [],
        })),
      });
    } catch (e) {
      console.error('GET /access-permissions:', e.message);
      return res.status(500).json({ error: 'Could not load access permissions' });
    }
  });

  app.post(`${base}/access-permissions`, ...orgAuth, canManage, async (req, res) => {
    const body = req.body || {};
    const orgUserId = Number.parseInt(String(body.org_user_id), 10);
    const permission = String(body.permission || '');
    const reason = String(body.reason || '').trim();
    const duration = String(body.duration || '');
    if (!PERMISSIONS.includes(permission)) return res.status(400).json({ error: 'Unknown permission.' });
    if (!req.givablePermissions.includes(permission)) return res.status(403).json({ error: 'You can not give that permission.' });
    if (!Number.isInteger(orgUserId) || orgUserId < 1) return res.status(400).json({ error: 'Pick a member' });
    if (reason.length < 5) return res.status(400).json({ error: 'Give a reason (at least 5 characters).' });
    if (!['ongoing', '30_days'].includes(duration)) return res.status(400).json({ error: 'Choose ongoing or 30 days.' });
    try {
      const target = await pool.query(
        `SELECT ou.id, ou.role::text AS role, u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.id = $2`,
        [req.orgId, orgUserId]);
      if (!target.rows.length) return res.status(404).json({ error: 'That member was not found in this workspace.' });
      if (permission === 'manage_personnel') {
        const budgetMgr = await pool.query(
          `SELECT 1 FROM org_access_permissions WHERE org_user_id = $1 AND permission = 'manage_budget' AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())`, [orgUserId]);
        if (!budgetMgr.rows.length && !FULL_ACCESS_ROLES.includes(target.rows[0].role)) {
          return res.status(400).json({ error: 'Personnel is an extra permission for a Budget manager. Make them a Budget manager first.' });
        }
      }
      if (FULL_ACCESS_ROLES.includes(target.rows[0].role)) {
        return res.status(400).json({ error: 'That member already has full access through their role.' });
      }
      await pool.query(
        `UPDATE org_access_permissions SET revoked_at = now()
          WHERE org_id = $1 AND org_user_id = $2 AND permission = $3 AND revoked_at IS NULL AND ends_at IS NOT NULL AND ends_at <= now()`,
        [req.orgId, orgUserId, permission]);
      const ins = await pool.query(
        `INSERT INTO org_access_permissions (org_id, org_user_id, permission, reason, ends_at, given_by_user_id)
         VALUES ($1, $2, $3, $4, CASE WHEN $5 = '30_days' THEN now() + interval '30 days' ELSE NULL END, $6)
         ON CONFLICT (org_user_id, permission) WHERE revoked_at IS NULL DO NOTHING
         RETURNING *`,
        [req.orgId, orgUserId, permission, reason, duration, req.user.user_id ?? req.user.id]);
      if (!ins.rows.length) return res.status(409).json({ error: 'That member already has this permission. Renew or revoke it instead.' });
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'create', tableName: 'org_access_permissions', recordId: ins.rows[0].id,
        fields: diffFields({}, ins.rows[0], AUDIT_FIELDS), metadata: { ...reqMeta(req), member: target.rows[0].email, duration },
      });
      return res.status(201).json({ permission: publicRow(ins.rows[0]) });
    } catch (e) {
      console.error('POST /access-permissions:', e.message);
      return res.status(500).json({ error: 'Could not give access' });
    }
  });

  async function loadOpen(req, res) {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) { res.status(400).json({ error: 'invalid id' }); return null; }
    const r = await pool.query(`SELECT * FROM org_access_permissions WHERE org_id = $1 AND id = $2 AND revoked_at IS NULL`, [req.orgId, id]);
    if (!r.rows.length) { res.status(404).json({ error: 'That permission was not found or was already revoked.' }); return null; }
    if (!req.givablePermissions.includes(r.rows[0].permission)) { res.status(403).json({ error: 'You can not change that permission.' }); return null; }
    return r.rows[0];
  }

  app.post(`${base}/access-permissions/:id/renew`, ...orgAuth, canManage, async (req, res) => {
    try {
      const row = await loadOpen(req, res); if (!row) return;
      if (row.ends_at == null) return res.status(400).json({ error: 'This permission is ongoing; there is nothing to renew.' });
      const upd = await pool.query(
        `UPDATE org_access_permissions SET ends_at = GREATEST(now(), ends_at) + interval '30 days', renewed_at = now() WHERE id = $1 RETURNING *`, [row.id]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_access_permissions', recordId: row.id,
        fields: diffFields(row, upd.rows[0], AUDIT_FIELDS), metadata: reqMeta(req),
      });
      return res.json({ permission: publicRow(upd.rows[0]) });
    } catch (e) {
      console.error('POST /access-permissions/:id/renew:', e.message);
      return res.status(500).json({ error: 'Could not renew' });
    }
  });

  app.post(`${base}/access-permissions/:id/revoke`, ...orgAuth, canManage, async (req, res) => {
    try {
      const row = await loadOpen(req, res); if (!row) return;
      const upd = await pool.query(
        `UPDATE org_access_permissions SET revoked_at = now(), revoked_by_user_id = $2 WHERE id = $1 RETURNING *`,
        [row.id, req.user.user_id ?? req.user.id]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_access_permissions', recordId: row.id,
        fields: diffFields(row, upd.rows[0], AUDIT_FIELDS), metadata: reqMeta(req),
      });
      return res.json({ permission: publicRow(upd.rows[0]) });
    } catch (e) {
      console.error('POST /access-permissions/:id/revoke:', e.message);
      return res.status(500).json({ error: 'Could not revoke' });
    }
  });

  app.get(`${base}/board-approver`, ...adminOnly, async (req, res) => {
    const r = await pool.query(`SELECT COALESCE((SELECT board_may_approve FROM org_settings WHERE org_id = $1), false) AS on_`, [req.orgId]);
    const n = await pool.query(`SELECT COUNT(*) AS n FROM org_users WHERE org_id = $1 AND role::text = ANY ($2)`, [req.orgId, FULL_ACCESS_ROLES]);
    return res.json({ board_may_approve: r.rows[0].on_, approvers: Number(n.rows[0].n), small_org: Number(n.rows[0].n) <= 2 });
  });
  app.put(`${base}/board-approver`, ...adminOnly, async (req, res) => {
    const on = req.body && req.body.board_may_approve === true;
    try {
      const before = await pool.query(`SELECT COALESCE((SELECT board_may_approve FROM org_settings WHERE org_id = $1), false) AS on_`, [req.orgId]);
      await pool.query(
        `INSERT INTO org_settings (org_id, board_may_approve) VALUES ($1, $2)
         ON CONFLICT (org_id) DO UPDATE SET board_may_approve = EXCLUDED.board_may_approve, updated_at = NOW()`, [req.orgId, on]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_settings', recordId: req.orgId,
        fields: diffFields({ board_may_approve: before.rows[0].on_ }, { board_may_approve: on }, ['board_may_approve']), metadata: reqMeta(req),
      });
      return res.json({ board_may_approve: on });
    } catch (e) {
      console.error('PUT /board-approver:', e.message);
      return res.status(500).json({ error: 'Could not save the setting' });
    }
  });

  app.put(`${base}/access-permission-settings`, ...adminOnly, async (req, res) => {
    const body = req.body || {};
    const can = body.finance_can_give_access === true;
    const list = Array.isArray(body.finance_giveable_permissions) ? [...new Set(body.finance_giveable_permissions.map(String))] : [];
    if (list.some((p) => !READ_PERMISSIONS.includes(p))) return res.status(400).json({ error: 'Unknown permission in the list.' });
    try {
      const before = await givingRules(req.orgId);
      await pool.query(
        `INSERT INTO org_settings (org_id, finance_can_give_access, finance_giveable_permissions) VALUES ($1, $2, $3::text[])
         ON CONFLICT (org_id) DO UPDATE SET finance_can_give_access = EXCLUDED.finance_can_give_access,
           finance_giveable_permissions = EXCLUDED.finance_giveable_permissions, updated_at = NOW()`,
        [req.orgId, can, can ? list : []]);
      await logAudit(pool, {
        orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'update', tableName: 'org_settings', recordId: req.orgId,
        fields: diffFields({ finance_can_give_access: before.financeCanGive, finance_giveable_permissions: before.giveable.join(',') },
          { finance_can_give_access: can, finance_giveable_permissions: (can ? list : []).join(',') }, ['finance_can_give_access', 'finance_giveable_permissions']),
        metadata: reqMeta(req),
      });
      return res.json({ finance_can_give_access: can, finance_giveable_permissions: can ? list : [] });
    } catch (e) {
      console.error('PUT /access-permission-settings:', e.message);
      return res.status(500).json({ error: 'Could not save the setting' });
    }
  });
}

module.exports = { registerAccessPermissionRoutes };
