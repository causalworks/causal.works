-- Adds link-share support to pod_access_permissions: a nullable
-- share_resource_url identifies a row as granting access via an unguessable,
-- publicly-readable COPY of the document (for email/non-Solid recipients),
-- rather than a checked WebID. Mutually exclusive with recipient_webid,
-- mirroring the is_container/org_document_id shape check migration 187 added
-- for container permissions.

ALTER TABLE pod_access_permissions ALTER COLUMN recipient_webid DROP NOT NULL;
ALTER TABLE pod_access_permissions ADD COLUMN share_resource_url text;
ALTER TABLE pod_access_permissions ADD CONSTRAINT pod_access_permissions_recipient_shape_check
  CHECK ((recipient_webid IS NOT NULL) <> (share_resource_url IS NOT NULL));

-- pod_acr_outbox gains a third reason: 'delete_share' - on revoke/expiry of a
-- link-share permission, the copy must be deleted outright (confirmed
-- decision, not just reverted to a private .acr), so the outbox worker needs
-- a way to tell "rebuild this resource's .acr" apart from "delete this
-- resource entirely."
ALTER TABLE pod_acr_outbox DROP CONSTRAINT pod_acr_outbox_reason_check;
ALTER TABLE pod_acr_outbox ADD CONSTRAINT pod_acr_outbox_reason_check
  CHECK (reason = ANY (ARRAY['permission'::text, 'revoke'::text, 'delete_share'::text]));

-- expire_due_pod_permissions(): expired link-share rows now enqueue a
-- 'delete_share' job against share_resource_url instead of (or in addition
-- to, if other rows share the original resource_url) the existing 'revoke'
-- rebuild against resource_url.
CREATE OR REPLACE FUNCTION expire_due_pod_permissions()
 RETURNS TABLE(permission_id integer, org_id integer, org_slug text, resource_url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH expired AS (
    UPDATE pod_access_permissions
       SET revoked_at = now(), revoked_reason = 'expired'
     WHERE revoked_at IS NULL AND expires_at <= now()
    RETURNING id, org_id, resource_url, share_resource_url
  ),
  distinct_resources AS (
    SELECT DISTINCT org_id, resource_url FROM expired WHERE share_resource_url IS NULL
  ),
  distinct_shares AS (
    SELECT DISTINCT org_id, share_resource_url FROM expired WHERE share_resource_url IS NOT NULL
  ),
  enqueued_revokes AS (
    INSERT INTO pod_acr_outbox (org_id, resource_url, reason)
    SELECT org_id, resource_url, 'revoke' FROM distinct_resources
    RETURNING 1
  ),
  enqueued_deletes AS (
    INSERT INTO pod_acr_outbox (org_id, resource_url, reason)
    SELECT org_id, share_resource_url, 'delete_share' FROM distinct_shares
    RETURNING 1
  )
  SELECT e.id AS permission_id, e.org_id, o.slug AS org_slug, e.resource_url
  FROM expired e
  JOIN coop_members o ON o.id = e.org_id;
$function$;
