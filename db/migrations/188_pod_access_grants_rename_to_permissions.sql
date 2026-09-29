-- Renames the pod-access "grant" vocabulary to "permission" throughout this
-- table and its dependents. Scoped strictly to the Solid-pod access-control
-- system (individual document sharing, Access Groups, the sync/fetch service
-- permission) - the unrelated Funders/Grants nonprofit module (org_grants
-- and friends) keeps "grant" exactly as-is, since that's the correct meaning
-- there. This is a rename, not a new table - all existing rows/data survive.

ALTER TABLE pod_access_grants RENAME TO pod_access_permissions;
ALTER SEQUENCE pod_access_grants_id_seq RENAME TO pod_access_permissions_id_seq;

ALTER TABLE pod_access_permissions RENAME COLUMN grantee_label TO recipient_label;
ALTER TABLE pod_access_permissions RENAME COLUMN grantee_webid TO recipient_webid;
ALTER TABLE pod_access_permissions RENAME COLUMN grantee_profile_url TO recipient_profile_url;

ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_pkey TO pod_access_permissions_pkey;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_container_shape_check TO pod_access_permissions_container_shape_check;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_revoked_reason_check TO pod_access_permissions_revoked_reason_check;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_created_by_user_id_fkey TO pod_access_permissions_created_by_user_id_fkey;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_group_id_fkey TO pod_access_permissions_group_id_fkey;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_org_document_id_fkey TO pod_access_permissions_org_document_id_fkey;
ALTER TABLE pod_access_permissions RENAME CONSTRAINT pod_access_grants_org_id_fkey TO pod_access_permissions_org_id_fkey;

ALTER INDEX idx_pod_access_grants_document RENAME TO idx_pod_access_permissions_document;
ALTER INDEX idx_pod_access_grants_expiry RENAME TO idx_pod_access_permissions_expiry;
ALTER INDEX idx_pod_access_grants_group RENAME TO idx_pod_access_permissions_group;
ALTER INDEX idx_pod_access_grants_org RENAME TO idx_pod_access_permissions_org;

ALTER POLICY pod_access_grants_org_isolation ON pod_access_permissions RENAME TO pod_access_permissions_org_isolation;

-- pod_acr_outbox: the column recording which recipient a rebuild reason
-- concerns, and the enum value describing "a permission was added" (as
-- opposed to revoked).
ALTER TABLE pod_acr_outbox RENAME COLUMN grantee_webid TO recipient_webid;
ALTER TABLE pod_acr_outbox DROP CONSTRAINT pod_acr_outbox_reason_check;
UPDATE pod_acr_outbox SET reason = 'permission' WHERE reason = 'grant';
ALTER TABLE pod_acr_outbox ADD CONSTRAINT pod_acr_outbox_reason_check CHECK (reason = ANY (ARRAY['permission'::text, 'revoke'::text]));

-- expire_due_pod_grants() -> expire_due_pod_permissions(): same body as the
-- live function (confirmed via pg_get_functiondef before writing this),
-- targeting the renamed table/columns, with permission_id replacing grant_id
-- in the returned row shape.
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
  SELECT e.id AS permission_id, e.org_id, o.slug AS org_slug, e.resource_url
  FROM expired e
  JOIN coop_members o ON o.id = e.org_id;
$function$;

DROP FUNCTION expire_due_pod_grants();
