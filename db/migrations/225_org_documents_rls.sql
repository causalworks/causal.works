-- Add RLS to org_documents, closing the last real tenant-isolation gap in the org_*
-- table set. Confirmed via schema.sql before this migration: 54 of 55 org_* tables already
-- have ENABLE + FORCE ROW LEVEL SECURITY with an org_id-isolation policy (see
-- org_accounts_org_isolation for the exact pattern this mirrors); org_documents was the one
-- exception, with no RLS at all despite having a real org_id and holding audit-relevant
-- content (board resolutions, IRS determination letters, insurance certificates -- exactly
-- what a Single Audit or SOC 2 review would ask about). Already flagged as a known gap back
-- at rev 48/Aug 30 (docs/Causal_Development_Path.md), independently re-confirmed by a
-- 2026-09-12 review; closing it now rather than leaving it open a second time.
--
-- (org_aliases and org_donation_url_suggestions were also named alongside org_documents in
-- that same 2026-09-12 review, but that part of the finding was wrong: both are unrelated
-- Individual-app tables -- a followable civic-org directory -- that happen to share the
-- org_* prefix by coincidence, per docs/Causal_Development_Path.md:163's already-made
-- decision to leave that naming overlap alone. Not touched here.)

ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.org_documents FORCE ROW LEVEL SECURITY;

CREATE POLICY org_documents_org_isolation ON public.org_documents
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

-- server/jobs/purge-synced-documents.js sweeps org_documents ACROSS EVERY ORG on a cron
-- schedule (hourly), outside any request's org context -- its own comment documented that
-- this was previously safe only because org_documents had no RLS at all. Now that it does,
-- the sweep needs the same SECURITY DEFINER escape hatch this codebase already uses for
-- exactly this situation (see expire_due_pod_permissions() above it in schema.sql, and
-- resolve_member_org_id() for the narrower single-org case): a function owned by its
-- creator (postgres, RLS-exempt) that does one narrow, auditable, cross-org read/write, with
-- RLS staying fully enforced for every other query against this table.
CREATE FUNCTION public.documents_due_for_local_purge(p_limit integer DEFAULT 100)
  RETURNS TABLE(id integer, org_id integer, stored_path text)
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT id, org_id, stored_path
      FROM org_documents
     WHERE pod_synced_at IS NOT NULL AND local_copy_purged_at IS NULL
     ORDER BY pod_synced_at
     LIMIT p_limit;
$$;

CREATE FUNCTION public.mark_document_local_copy_purged(p_document_id integer)
  RETURNS void
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    UPDATE org_documents SET local_copy_purged_at = now() WHERE id = p_document_id;
$$;

-- documentPurge.js's own defense-in-depth re-check (refuses to purge unless pod_synced_at is
-- actually set, independent of what the sweep already filtered on) needs the same RLS
-- exemption -- it's called with a raw, context-less pool from the cron job, not from a
-- request. Scoped by BOTH id and org_id, same as the check it replaces, so it can't be used
-- to probe an arbitrary document id across orgs.
CREATE FUNCTION public.get_document_purge_status(p_document_id integer, p_org_id integer)
  RETURNS TABLE(id integer, stored_path text, pod_synced_at timestamp with time zone, local_copy_purged_at timestamp with time zone)
  LANGUAGE sql SECURITY DEFINER
  SET search_path TO 'public'
  AS $$
    SELECT id, stored_path, pod_synced_at, local_copy_purged_at
      FROM org_documents
     WHERE id = p_document_id AND org_id = p_org_id;
$$;
