'use strict';

const { enterOrgContext, enterProgramScope } = require('../lib/orgContext');
const { touchSession, sessionTokenFor } = require('../../auth');
const { programScopeFor } = require('../lib/programScope');
const { FINANCE_ROLES } = require('../lib/orgRoles');

function requireOrgMembership(pool) {
  return async function (req, res, next) {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const r = await pool.query(
        `SELECT * FROM resolve_member_org_id_and_role($1, $2)`,
        [userId, slug]
      );
      if (r.rows.length === 0) {
        return res.status(404).json({ error: 'Organization not found' });
      }
      req.orgId = r.rows[0].org_id;
      req.coopOrgRole = r.rows[0].role;
      req.coopOrgUserId = r.rows[0].org_user_id;
      req.coopOrgProgramIds = r.rows[0].program_ids || [];
      enterOrgContext(req.orgId);
      req.accessPermissions = [];
      try {
        const ap = await pool.query(
          `SELECT permission FROM org_access_permissions
            WHERE org_user_id = $1 AND revoked_at IS NULL AND (ends_at IS NULL OR ends_at > now())`,
          [req.coopOrgUserId]
        );
        req.accessPermissions = ap.rows.map((x) => x.permission);
      } catch (permErr) {
        console.error('requireOrgMembership access-permission lookup failed:', permErr.message);
      }
      enterProgramScope(programScopeFor(req));

      const token = sessionTokenFor(req);
      if (token) {
        pool
          .query('SELECT session_timeout_minutes FROM org_settings WHERE org_id = $1', [req.orgId])
          .then((r2) => {
            const minutes = r2.rows[0]?.session_timeout_minutes;
            if (minutes) touchSession(pool, token, minutes);
          })
          .catch((err) => console.error('requireOrgMembership session-timeout lookup failed:', err.message));
      }

      next();
    } catch (e) {
      console.error('requireOrgMembership:', e.message);
      res.status(500).json({ error: 'Could not verify organization access' });
    }
  };
}

function requireOrgRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return function (req, res, next) {
    if (!allowed.includes(req.coopOrgRole)) {
      return res.status(403).json({ error: `This action requires one of these roles in this organization: ${allowed.join(', ')}.` });
    }
    next();
  };
}

module.exports = { requireOrgMembership, requireOrgRole, FINANCE_ROLES };
