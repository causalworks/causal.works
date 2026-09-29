-- 180: Group provenance + indefinite grants on pod_access_grants.
--
-- group_id: NULL means an ad-hoc, one-off grant (existing behavior, unchanged).
-- Non-null means this grant exists because its grantee was a member of that
-- group when a matching document synced - cascade revocation on group
-- membership removal targets exactly these rows. ON DELETE SET NULL (not
-- CASCADE): deleting the group config itself should never silently delete
-- grant history; podAccessGroups.js explicitly revokes+rebuilds every
-- group-provenance grant before a group is deleted, so by the time a delete
-- reaches the DB there should be nothing left with that group_id anyway.
--
-- expires_at nullable: group-derived grants are indefinite, tied to
-- membership rather than a timer (revoked on group removal, not expiry).
-- Ad-hoc grants (group_id IS NULL) still always carry an expires_at - the
-- podGrants.js route continues to require one for that path unchanged.

ALTER TABLE pod_access_grants ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE pod_access_grants
    ADD COLUMN group_id integer REFERENCES pod_access_groups(id) ON DELETE SET NULL;

CREATE INDEX idx_pod_access_grants_group ON pod_access_grants (group_id) WHERE group_id IS NOT NULL;

ALTER TABLE pod_access_grants DROP CONSTRAINT pod_access_grants_revoked_reason_check;
ALTER TABLE pod_access_grants ADD CONSTRAINT pod_access_grants_revoked_reason_check
    CHECK (revoked_reason = ANY (ARRAY['manual'::text, 'expired'::text, 'group_removed'::text]));
