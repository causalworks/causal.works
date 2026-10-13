-- 182: Cross-org claim function for the .acr outbox worker.
--
-- Same problem/solution as expire_due_pod_grants() (migration 174):
-- pod_acr_outbox has FORCE RLS keyed on one org at a time, but the worker
-- (server/jobs/process-acr-outbox.js) legitimately needs to find and claim
-- due rows across every org in one sweep. SECURITY DEFINER bypasses RLS for
-- this one narrow, well-defined operation (claim rows due now, mark them
-- 'processing'); the worker still enters the specific org's context before
-- doing anything further with that row (rebuilding the ACR, writing back its
-- outcome), same as expire-pod-grants.js already does.
--
-- Single UPDATE...RETURNING, no SKIP LOCKED: this worker runs as one cron
-- process, not multiple concurrent instances, matching every other job in
-- this codebase - not worth the extra complexity ahead of an actual need.

CREATE OR REPLACE FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer DEFAULT 50)
RETURNS TABLE(
    id integer,
    org_id integer,
    org_slug text,
    resource_url text,
    attempt_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH claimed AS (
    UPDATE pod_acr_outbox
       SET status = 'processing'
     WHERE id IN (
       SELECT o.id FROM pod_acr_outbox o
        WHERE o.status = 'pending' AND o.next_attempt_at <= now()
        ORDER BY o.created_at
        LIMIT p_limit
     )
    RETURNING id, org_id, resource_url, attempt_count
  )
  SELECT c.id, c.org_id, m.slug AS org_slug, c.resource_url, c.attempt_count
  FROM claimed c
  JOIN coop_members m ON m.id = c.org_id;
$function$;
