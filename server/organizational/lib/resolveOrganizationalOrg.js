'use strict';

const { enterOrgContext } = require('./orgContext');

// Routed through resolve_member_org_id() (migration 148), a SECURITY
// DEFINER function, instead of a direct join -- org_users has a fail-closed
// RLS policy keyed on app.current_org_id, but that's exactly the thing this
// lookup exists to discover, so it can't be set yet at this point. The
// function runs with its owner's privileges (postgres, RLS-exempt)
// regardless of caller, bypassing RLS for this one narrow, auditable
// purpose while org_users' policy stays fully enforced everywhere else.
//
// These two functions are also the chokepoint every route already calls to
// resolve which org a request is scoped to -- so the moment one resolves
// an id, it enters that org into the request's async context
// (orgContext.js). Every pool.query()/pool.connect() call for the rest of
// that request then automatically runs org-scoped (scopedPool.js), with no
// changes needed at any individual call site.

/** Resolve coop_members.id for a member user and org slug. */
async function orgIdForMember(pool, userId, slug) {
  const r = await pool.query(`SELECT resolve_member_org_id($1, $2, false) AS org_id`, [userId, slug]);
  const orgId = r.rows.length && r.rows[0].org_id != null ? r.rows[0].org_id : null;
  if (orgId != null) enterOrgContext(orgId);
  return orgId;
}

/** Resolve coop_members.id for a member user and org slug, but only if that user is an admin. */
async function orgIdForAdminMember(pool, userId, slug) {
  const r = await pool.query(`SELECT resolve_member_org_id($1, $2, true) AS org_id`, [userId, slug]);
  const orgId = r.rows.length && r.rows[0].org_id != null ? r.rows[0].org_id : null;
  if (orgId != null) enterOrgContext(orgId);
  return orgId;
}

module.exports = { orgIdForMember, orgIdForAdminMember };
