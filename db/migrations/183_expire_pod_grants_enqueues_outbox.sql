-- 183: expire_due_pod_grants() now enqueues .acr outbox rows itself, in the
-- same statement as the expiry UPDATE, instead of the caller
-- (expire-pod-grants.js) rebuilding each resource's .acr directly and
-- synchronously.
--
-- This job had the exact same latent gap the outbox was built to close for
-- group-member removal: a synchronous rebuild with no retry on failure and
-- no drift detection if it silently didn't happen. Since the outbox
-- infrastructure now exists (migrations 181-182), routing this job through
-- it too - rather than leaving it as a second, inconsistent mechanism
-- chasing the same goal - closes the gap here as well, not just for group
-- removal.

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
  ),
  distinct_resources AS (
    SELECT DISTINCT org_id, resource_url FROM expired
  ),
  enqueued AS (
    INSERT INTO pod_acr_outbox (org_id, resource_url, reason)
    SELECT org_id, resource_url, 'revoke' FROM distinct_resources
    RETURNING 1
  )
  SELECT e.id AS grant_id, e.org_id, o.slug AS org_slug, e.resource_url
  FROM expired e
  JOIN coop_members o ON o.id = e.org_id;
$function$;
