-- 256: Step B (server/organizational/middleware/requireOrgMembership.js) needs a
-- caller's org_users.id (to look up org_program_grants) and their granted
-- program_ids, not just org_id/role. Extends resolve_member_org_id_and_role()
-- (migration 150) rather than adding a second per-request query -- it's
-- already the one SECURITY DEFINER chokepoint for this exact bootstrapping
-- problem (org_users' RLS needs app.current_org_id, which this lookup exists
-- to discover), so folding program-grant resolution into the same round
-- trip avoids a second bypass-RLS query on every request.
--
-- Return-shape change requires a real DROP first (same lesson as migration
-- 254 -- CREATE OR REPLACE alone refuses when the OUT-parameter shape
-- changes). Only caller is requireOrgMembership.js (confirmed via grep),
-- which already does `SELECT * FROM ...` and reads specific columns off the
-- result -- safe to add columns without touching that call site's shape
-- assumptions.
--
-- program_ids is always a real array, never NULL (COALESCE to empty array)
-- so callers never need a null-check -- an admin/finance/staff row simply
-- gets an empty array, same as a program-role row with no grants yet.

DROP FUNCTION IF EXISTS resolve_member_org_id_and_role(integer, text);

CREATE FUNCTION resolve_member_org_id_and_role(p_user_id integer, p_slug text)
RETURNS TABLE(org_id integer, role text, org_user_id integer, program_ids integer[])
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    m.role::text,
    m.id,
    COALESCE(
      (SELECT array_agg(g.program_id ORDER BY g.program_id)
         FROM org_program_grants g
        WHERE g.org_user_id = m.id),
      ARRAY[]::integer[]
    )
  FROM coop_members o
  INNER JOIN org_users m ON m.org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug AND o.deleted_at IS NULL
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION resolve_member_org_id_and_role(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_member_org_id_and_role(integer, text) TO causal_app;
