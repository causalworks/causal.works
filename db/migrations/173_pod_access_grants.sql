-- 173: Scoped, expiring pod access grants (ACP-backed).
--
-- One row per external-party grant on one org_documents resource. The row is
-- the source of truth; the resource's .acr file in CSS is a generated
-- projection rebuilt from all non-revoked, non-expired grant rows for that
-- resource (see server/organizational/lib/podGrants.js) - never hand-patched
-- Turtle, always fully regenerated, same one-way-sync philosophy as the rest
-- of this pod integration.
--
-- grantee_webid is always populated: if the admin enters a WebID directly,
-- it's used as-is; if they enter an email, a throwaway WebID profile is
-- minted under the org's own pod (grants/<uuid>/profile.ttl) and that WebID
-- is stored here instead.

CREATE TABLE pod_access_grants (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    org_document_id integer NOT NULL REFERENCES org_documents(id) ON DELETE CASCADE,
    resource_url text NOT NULL,
    grantee_label text NOT NULL,
    grantee_webid text NOT NULL,
    grantee_profile_url text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    revoked_reason text CHECK (revoked_reason IN ('manual', 'expired')),
    created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_pod_access_grants_org ON pod_access_grants (org_id, created_at DESC);
CREATE INDEX idx_pod_access_grants_document ON pod_access_grants (org_document_id);
CREATE INDEX idx_pod_access_grants_expiry ON pod_access_grants (expires_at) WHERE revoked_at IS NULL;

ALTER TABLE pod_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE pod_access_grants FORCE ROW LEVEL SECURITY;

CREATE POLICY pod_access_grants_org_isolation ON pod_access_grants
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE ON TABLE pod_access_grants TO causal_app;
GRANT USAGE ON SEQUENCE pod_access_grants_id_seq TO causal_app;
