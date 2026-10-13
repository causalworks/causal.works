-- 148: RLS enforcement, part 1 -- the bootstrapping problem.
--
-- org_users already has a fail-closed RLS policy from migration 137
-- (coop_org_id = current_setting('app.current_org_id')). But
-- coopOrgIdForMember()/coopOrgIdForAdminMember() -- called by every route
-- in the app -- query org_users specifically to DISCOVER which org a user
-- belongs to, given only their user_id and the org's slug. At that moment
-- the org id isn't known yet, so app.current_org_id can't be set, so once
-- RLS is actually enforced (causal_app instead of postgres) this policy
-- would return zero rows on every single request, permanently. This is
-- almost certainly why migration 137's RLS was built but never wired in.
--
-- Fix: a narrow, auditable SECURITY DEFINER function. It runs with its
-- owner's privileges (postgres -- a superuser, exempt from RLS) regardless
-- of which role calls it, so this one bootstrapping lookup bypasses RLS
-- while org_users' policy stays untouched and fully enforced for every
-- other query against it. Scope is deliberately narrow: given a user_id
-- and a slug, return the org id IF that user is a member (optionally
-- admin-only) -- the same thing coopOrgIdForMember/coopOrgIdForAdminMember
-- already did via a direct join, just now routed through a function that
-- can see through RLS for this one purpose.

CREATE OR REPLACE FUNCTION resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean DEFAULT false)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id
  FROM coop_members o
  INNER JOIN org_users m ON m.coop_org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug
    AND (NOT p_require_admin OR m.role = 'admin')
  LIMIT 1;
$$;

-- Only the app role should ever call this -- not PUBLIC.
REVOKE ALL ON FUNCTION resolve_member_org_id(integer, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_member_org_id(integer, text, boolean) TO causal_app;

-- Cosmetic fix left over from migration 144's mechanical rename: the
-- policy on org_users became "org_org_users_org_isolation" (doubled "org")
-- because the rename only knew the OLD policy name, not that the table
-- itself picked up an extra rename (coop_org_users -> org_users, not just
-- coop_-> org_). Fixing for consistency while touching this table's RLS.
ALTER POLICY org_org_users_org_isolation ON org_users RENAME TO org_users_org_isolation;
