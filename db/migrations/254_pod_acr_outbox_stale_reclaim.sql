-- 254: Reclaim stale 'processing' rows in pod_acr_outbox.
--
-- Real gap identified in Per_User_Solid_Identity_Plan.md's Gap 2 analysis and
-- explicitly flagged as "not yet built" in process-acr-outbox.js's own
-- comments: if a row is claimed (marked 'processing') and the worker process
-- then fails to record any outcome for it - a crash mid-processing, or the
-- recovery UPDATE in its catch block itself throwing - the row is orphaned at
-- 'processing' forever, with no retry and nothing that would ever catch it.
--
-- Confirmed live, not hypothetical: 3 rows for org 42 (demo-company) had sat
-- at 'processing' since 2026-09-03 with zero attempts recorded.
--
-- Fix: add claimed_at (set the instant a row is claimed), and have the claim
-- function itself reclaim any row still 'processing' after a generous grace
-- period (2 minutes - this worker's own individual .acr rebuilds take under a
-- second each) back to 'pending' before claiming new work. Folded into the
-- existing claim function rather than a separate job, keeping the "one cron
-- process, one UPDATE" pattern already used throughout this file - no new
-- job, no SKIP LOCKED, matching migration 182's own reasoning.

ALTER TABLE pod_acr_outbox ADD COLUMN IF NOT EXISTS claimed_at timestamp with time zone;

-- Current signature (migration 190) includes `reason`, which CREATE OR
-- REPLACE can keep, but changing OUT-parameter shape at all requires a real
-- DROP first (confirmed live: CREATE OR REPLACE alone refused with "cannot
-- change return type of existing function" even though every existing column
-- is unchanged here - only relevant if the shape is touched at all).
DROP FUNCTION public.claim_due_pod_acr_outbox_rows(integer);

CREATE FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer DEFAULT 50)
RETURNS TABLE(
    id integer,
    org_id integer,
    org_slug text,
    resource_url text,
    reason text,
    attempt_count integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH reclaimed AS (
    UPDATE pod_acr_outbox
       SET status = 'pending',
           attempt_count = attempt_count + 1,
           last_error = 'reclaimed: orphaned in processing status past grace period',
           next_attempt_at = now()
     WHERE status = 'processing'
       AND (claimed_at IS NULL OR claimed_at < now() - interval '2 minutes')
  ),
  claimed AS (
    UPDATE pod_acr_outbox
       SET status = 'processing', claimed_at = now()
     WHERE id IN (
       SELECT o.id FROM pod_acr_outbox o
        WHERE o.status = 'pending' AND o.next_attempt_at <= now()
        ORDER BY o.created_at
        LIMIT p_limit
     )
    RETURNING id, org_id, resource_url, reason, attempt_count
  )
  SELECT c.id, c.org_id, m.slug AS org_slug, c.resource_url, c.reason, c.attempt_count
  FROM claimed c
  JOIN coop_members m ON m.id = c.org_id;
$function$;
