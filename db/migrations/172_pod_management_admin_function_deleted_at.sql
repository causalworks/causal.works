-- 172: Fix admin_list_orgs_with_pod_status() (migration 171) to exclude
-- soft-deleted orgs. Missed in the original - found while decommissioning
-- pod-pilot (coop_members.deleted_at is this app's standard soft-delete
-- convention, see server/organizational/routes/orgs.js's DELETE handler and
-- server/jobs/purge-deleted-orgs.js). A platform-wide admin view showing a
-- soft-deleted org would be confusing/misleading.
--
-- Note: the pre-existing sibling function admin_list_orgs_with_member_counts()
-- (migration 149) has this same gap and was NOT touched here - out of scope
-- for this fix, flagged separately in DevPath.

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
  WHERE o.deleted_at IS NULL
  ORDER BY o.display_name;
$function$;
