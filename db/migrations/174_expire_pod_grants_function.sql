-- 174: Cross-org expiry sweep for pod_access_grants.
--
-- Same problem/solution as admin_list_orgs_with_pod_status() (migration 171):
-- pod_access_grants has FORCE RLS keyed on one org at a time, but the expiry
-- job (server/jobs/expire-pod-grants.js) legitimately needs to find and mark
-- overdue grants across every org in one sweep. SECURITY DEFINER bypasses RLS
-- for this one narrow, well-defined operation (mark expired, nothing else);
-- the caller still has to rebuild each affected resource's .acr afterward
-- through the normal org-scoped path.

CREATE OR REPLACE FUNCTION public.expire_due_pod_grants()
RETURNS TABLE(
    grant_id integer,
    org_id integer,
    org_slug text,
    resource_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH expired AS (
    UPDATE pod_access_grants
       SET revoked_at = now(), revoked_reason = 'expired'
     WHERE revoked_at IS NULL AND expires_at <= now()
    RETURNING id, org_id, resource_url
  )
  SELECT e.id AS grant_id, e.org_id, o.slug AS org_slug, e.resource_url
  FROM expired e
  JOIN coop_members o ON o.id = e.org_id;
$function$;
