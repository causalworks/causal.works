-- process-acr-outbox.js needs to distinguish a 'delete_share' row (delete the
-- resource outright) from a 'permission'/'revoke' row (rebuild its .acr) -
-- claim_due_pod_acr_outbox_rows() didn't return reason at all before this,
-- so the worker had no way to tell them apart.
DROP FUNCTION public.claim_due_pod_acr_outbox_rows(integer);

CREATE OR REPLACE FUNCTION public.claim_due_pod_acr_outbox_rows(p_limit integer DEFAULT 50)
 RETURNS TABLE(id integer, org_id integer, org_slug text, resource_url text, reason text, attempt_count integer)
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
    RETURNING id, org_id, resource_url, reason, attempt_count
  )
  SELECT c.id, c.org_id, m.slug AS org_slug, c.resource_url, c.reason, c.attempt_count
  FROM claimed c
  JOIN coop_members m ON m.id = c.org_id;
$function$;
