-- 149: RLS enforcement, part 4 -- two genuinely cross-org operations that
-- can't go through the per-request org-scoping mechanism (migration 148 +
-- server/organizational/lib/orgContext.js/scopedPool.js) because they're
-- not scoped to a single org by nature:
--
--   1. Platform-admin hard-delete of a coop_members row (server.js
--      /admin/np-orgs/:id/delete, and the identical operation in the
--      scheduled purge-deleted-orgs job) -- cascades via FK ON DELETE
--      CASCADE into ~30 org_* tables. Postgres RLS applies to
--      cascade-triggered deletes on the child tables, same as any other
--      DML -- with no app.current_org_id GUC set (there's no single org
--      this delete is "scoped to"), those cascades would be filtered down
--      to zero rows by each child table's policy, silently orphaning data
--      instead of actually deleting it.
--   2. Platform-admin org list with a per-org member count (server.js
--      /admin dashboard) -- inherently reads across every org, not one.
--
-- Same pattern as resolve_member_org_id() (migration 148): a narrow,
-- auditable SECURITY DEFINER function per legitimate cross-org need,
-- rather than granting BYPASSRLS broadly to causal_app (which would
-- silently disable RLS for every query that role ever runs, defeating the
-- entire point of this work).

CREATE OR REPLACE FUNCTION admin_delete_org(p_org_id integer)
RETURNS TABLE(id integer, slug text, display_name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM coop_members WHERE coop_members.id = p_org_id
  RETURNING coop_members.id, coop_members.slug, coop_members.display_name;
$$;

CREATE OR REPLACE FUNCTION admin_list_orgs_with_member_counts()
RETURNS TABLE(id integer, display_name text, slug text, created_at timestamptz, member_count integer)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.display_name, o.slug, o.created_at,
         (SELECT COUNT(*)::int FROM org_users u WHERE u.coop_org_id = o.id) AS member_count
  FROM coop_members o
  ORDER BY o.created_at DESC;
$$;

REVOKE ALL ON FUNCTION admin_delete_org(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION admin_list_orgs_with_member_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_org(integer) TO causal_app;
GRANT EXECUTE ON FUNCTION admin_list_orgs_with_member_counts() TO causal_app;
