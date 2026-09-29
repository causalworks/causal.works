'use strict';

const { enterOrgContext, enterProgramScope } = require('../lib/orgContext');
const { touchSession, SESSION_COOKIE } = require('../../auth');
const { programScopeFor } = require('../lib/programScope');
const { FINANCE_ROLES } = require('../lib/orgRoles');

/**
 * Use after requireAuth + requireOrganizationalAccess, on routes with a :slug param.
 * Verifies req.user is actually a member of the org named by :slug (not just that the
 * org exists), and attaches req.orgId / req.coopOrgRole for handlers to use instead
 * of re-resolving the slug themselves. Also attaches req.coopOrgUserId (the org_users.id
 * row, not the platform user id) and req.coopOrgProgramIds (integer[], always a real
 * array even when empty) -- the latter is only meaningful for the 'program' role
 * (see .claude/plans/2026-09-19-solid-odi-demo-readiness.md); other roles simply get [].
 *
 * Routed through resolve_member_org_id_and_role() (migration 150, extended by
 * migration 256 to also resolve org_program_grants in the same round trip), a
 * SECURITY DEFINER function, for the same reason orgIdForMember() is
 * (see resolveOrganizationalOrg.js) -- org_users' RLS policy needs
 * app.current_org_id already set, which is exactly what this lookup exists
 * to discover. Also enters the org into the request's async context so
 * every query for the rest of the request is automatically org-scoped --
 * this middleware is a separate chokepoint from orgIdForMember(), so it
 * needs the same enterOrgContext() call, not just the RLS bypass.
 */
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
      // RLS backstop (migration 259) -- mirrors the same role check
      // programScopeFor() uses for app-layer filtering, entered here once
      // per request so scopedPool.js can set app.current_program_ids on
      // every query for the rest of the request without each route having
      // to remember to call programScopeFor() itself.
      enterProgramScope(programScopeFor(req));

      // Extend the session using this org's configured timeout (Org Settings) instead of
      // the platform default, for as long as the user keeps hitting this org's API routes.
      // Best-effort: a lookup failure here should never block the request it's piggybacking on.
      const token = req.cookies?.[SESSION_COOKIE];
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

/**
 * Use after requireOrgMembership. 403s unless the caller's role in this org
 * matches. Accepts a single role string (backward compatible with every
 * existing call site) or an array of acceptable roles.
 */
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
