-- 152: RLS enforcement, part 7 -- closes the org_users bootstrapping
-- problem generally instead of chasing individual call sites.
--
-- Migrations 148/150/151 fixed the two dominant chokepoints
-- (coopOrgIdForMember/coopOrgIdForAdminMember, requireOrgMembership) plus a
-- systematic audit's worth of ad hoc bootstrap queries (sponsored-
-- projects.js, compliance.js's dashboard routes) with SECURITY DEFINER
-- functions. But that audit then turned up a FIFTH shape
-- (compliance.js's GET /obligations/:id, which verifies access by joining
-- org_users on a specific obligation id + user_id, with no org context
-- established yet either) -- strong evidence there are more of these
-- scattered around than are worth finding one at a time.
--
-- A second, SELECT-only, permissive RLS policy on org_users: a row is also
-- visible if it belongs to the current authenticated user (regardless of
-- org context), not just if it belongs to the currently-scoped org.
-- Permissive policies for the same command are OR'd together in Postgres,
-- so this is additive to the existing org-scoped policy, not a replacement
-- -- and SELECT-only means it grants no new write capability, just lets a
-- user look up their OWN memberships before an org id is known, which is
-- exactly the shape every one of these bootstrapping queries needs.
--
-- Requires app.current_user_id to be set, which server/auth.js's
-- requireAuth()/requireAuthPage()/attachUserOptional() now do via
-- enterUserContext() (server/organizational/lib/orgContext.js) the moment
-- a session resolves -- for every authenticated request, before any org is
-- known. scopedPool.js sets the GUC from that context on every query.

CREATE POLICY org_users_self_visibility ON org_users
  FOR SELECT
  USING (user_id = (current_setting('app.current_user_id', true))::integer);
