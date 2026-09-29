-- 150: RLS enforcement, part 5 -- a second, separately-discovered
-- bootstrapping chokepoint. requireOrgMembership.js (used by
-- server/organizational/routes/orgs.js, not the more common
-- coopOrgIdForMember()/coopOrgIdForAdminMember() pattern used everywhere
-- else) does its own direct join against org_users/coop_members to resolve
-- both the org id AND the caller's role in one query -- same bootstrapping
-- problem as migration 148 fixed for the other chokepoint: this lookup
-- needs to run before the org id is known, so it can't rely on the
-- app.current_org_id GUC that org_users' RLS policy requires.

CREATE OR REPLACE FUNCTION resolve_member_org_id_and_role(p_user_id integer, p_slug text)
RETURNS TABLE(org_id integer, role text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, m.role::text
  FROM coop_members o
  INNER JOIN org_users m ON m.coop_org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug AND o.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_member_org_id_and_role(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_member_org_id_and_role(integer, text) TO causal_app;
