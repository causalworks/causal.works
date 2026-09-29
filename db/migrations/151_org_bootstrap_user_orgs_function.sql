-- 151: RLS enforcement, part 6 -- a systematic audit (grepping every
-- `org_users WHERE ... user_id` query in server/organizational/) found
-- FOUR distinct ad hoc shapes of the same bootstrapping problem migrations
-- 148/150 fixed for the two dominant chokepoints, scattered across
-- sponsored-projects.js, cooperative.js, orgs.js, and compliance.js:
--   (a) slug + user_id -> one org (same shape as resolve_member_org_id)
--   (b) user_id only -> the caller's first/arbitrary org (no slug in the
--       route at all, e.g. /api/organizational/compliance/dashboard)
--   (c) user_id only -> ALL of the caller's orgs (an org-switcher-style
--       "list my organizations", or cooperative.js's "list other coop
--       members, excluding mine" which needs its own org ids to exclude)
-- (a) reuses resolve_member_org_id() (migration 148) at each call site.
-- (b) and (c) both need the caller's full org-id set -- (b) just takes the
-- first row -- so one function covers both.

CREATE OR REPLACE FUNCTION resolve_user_org_ids(p_user_id integer)
RETURNS TABLE(org_id integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coop_org_id FROM org_users WHERE user_id = p_user_id;
$$;

REVOKE ALL ON FUNCTION resolve_user_org_ids(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_user_org_ids(integer) TO causal_app;
