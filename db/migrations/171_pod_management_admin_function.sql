-- 171: Cross-org read for the coop-wide Pod Management view.
--
-- Same problem/solution as admin_list_orgs_with_member_counts() (migration 149):
-- org_settings has FORCE RLS keyed on a single app.current_org_id GUC, but this
-- view legitimately needs to list every org's pod status at once, which no
-- single org context can satisfy. SECURITY DEFINER bypasses RLS for exactly
-- this one narrow, read-only, admin-gated purpose (see requirePlatformAdmin.js
-- for the app-level gate - this function has no authorization check of its
-- own, same as admin_list_orgs_with_member_counts()).

CREATE OR REPLACE FUNCTION public.admin_list_orgs_with_pod_status()
RETURNS TABLE(
    org_id integer,
    display_name text,
    slug text,
    pod_provisioned boolean,
    pod_provisioned_at timestamp with time zone,
    pod_last_synced_at timestamp with time zone,
    pod_provisioning_error text,
    document_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    o.id AS org_id,
    o.display_name,
    o.slug,
    COALESCE(s.pod_provisioned, false) AS pod_provisioned,
    s.pod_provisioned_at,
    s.pod_last_synced_at,
    s.pod_provisioning_error,
    (SELECT COUNT(*)::int FROM org_documents d WHERE d.org_id = o.id AND d.archived_at IS NULL) AS document_count
  FROM coop_members o
  LEFT JOIN org_settings s ON s.org_id = o.id
  ORDER BY o.display_name;
$function$;
