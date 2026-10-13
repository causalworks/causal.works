-- 177: SECURITY DEFINER functions for org_pod_credentials read/write.
--
-- Structural fix, not a third patch of the same bug. This is the THIRD time
-- this session a write to an RLS-protected table failed because the ambient
-- app.current_org_id GUC wasn't set (orgs.js's provisionPodForOrg, workshop
-- PodSync's rebuildResourceAcr, and now this credential-storage call site,
-- which happened live during the demo-company migration and caused a real
-- incident - see DevPath rev 56).
--
-- The actual pattern underneath all three: "remember to call enterOrgContext
-- before this query" is a footgun that will keep recurring at new call sites,
-- especially standalone scripts/migrations that were never written to run
-- inside Express's per-request context in the first place. For org_pod_
-- credentials specifically, the fix is structural: this table is only ever
-- written/read with an org_id the caller already explicitly knows (never
-- derived from an ambient session) - there's no actual reason for it to
-- depend on RLS/GUC context at all. Bypassing RLS via SECURITY DEFINER
-- (same pattern as admin_list_orgs_with_pod_status()/expire_due_pod_grants())
-- removes the dependency on remembering enterOrgContext for this table
-- entirely, rather than relying on every future call site getting it right.
--
-- This does not fix the general class of bug for org-scoped tables where RLS
-- is the actual desired isolation boundary (e.g. org_documents, org_settings
-- reads triggered by a real user session) - those still need real context.
-- It only applies where, like here, the org_id is already a trusted, explicit
-- input rather than something RLS needs to enforce against a session.

CREATE OR REPLACE FUNCTION public.store_org_pod_credential(
    p_org_id integer,
    p_account_email text,
    p_encrypted_password text,
    p_encryption_iv text,
    p_encryption_auth_tag text,
    p_pod_webid text
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  INSERT INTO org_pod_credentials (org_id, account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid)
  VALUES (p_org_id, p_account_email, p_encrypted_password, p_encryption_iv, p_encryption_auth_tag, p_pod_webid)
  ON CONFLICT (org_id) DO UPDATE SET
    account_email = EXCLUDED.account_email,
    encrypted_password = EXCLUDED.encrypted_password,
    encryption_iv = EXCLUDED.encryption_iv,
    encryption_auth_tag = EXCLUDED.encryption_auth_tag,
    pod_webid = EXCLUDED.pod_webid;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_org_pod_credential(p_org_id integer)
RETURNS TABLE(
    account_email text,
    encrypted_password text,
    encryption_iv text,
    encryption_auth_tag text,
    pod_webid text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT account_email, encrypted_password, encryption_iv, encryption_auth_tag, pod_webid
  FROM org_pod_credentials WHERE org_id = p_org_id;
$function$;
