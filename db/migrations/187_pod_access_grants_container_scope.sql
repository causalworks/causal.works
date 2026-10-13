-- 187: Container-scoped, write-capable grants on pod_access_grants, plus
-- storage for Causal's own stable sync/fetch service identity.
--
-- Every existing grant targets ONE already-existing document, read-only
-- (podGrants.js's buildAcrTurtle hardcodes acl:Read). That's the wrong
-- shape for "the org grants Causal's sync/fetch service permission to
-- write documents that don't exist yet" - confirmed live this session that
-- ACP CAN express this, but only via a genuinely different grant shape:
-- targeting a CONTAINER (not a document), with BOTH acp:accessControl and
-- acp:memberAccessControl on that container (confirmed: a single grant on
-- the org's documents/ root cascades correctly through nested category
-- subcontainers for create/write/read, no per-category grant needed).
--
-- org_document_id becomes nullable: a container grant has no single
-- document to reference. can_write defaults false so every EXISTING grant
-- (all per-document, all read-only today) is unaffected by this migration.

ALTER TABLE pod_access_grants ALTER COLUMN org_document_id DROP NOT NULL;
ALTER TABLE pod_access_grants ADD COLUMN is_container boolean NOT NULL DEFAULT false;
ALTER TABLE pod_access_grants ADD COLUMN can_write boolean NOT NULL DEFAULT false;
ALTER TABLE pod_access_grants ADD CONSTRAINT pod_access_grants_container_shape_check
    CHECK ((is_container AND org_document_id IS NULL) OR (NOT is_container AND org_document_id IS NOT NULL));

-- Causal's own stable, self-registered sync/fetch service identity -
-- deliberately NOT the coop pod's existing identity/credential (that
-- represents the cooperative's shared library, a different feature; reusing
-- it here would make grant audit logs read as "the coop has access to your
-- documents" when it actually means "Causal's automated sync does").
-- Singleton, exact same shape as coop_pod_credentials (migration 175) -
-- same encryption pattern (only the password is encrypted, matching
-- podCredentialCrypto.js), same table-per-singleton-identity convention.
CREATE TABLE causal_service_credentials (
    id integer PRIMARY KEY DEFAULT 1,
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT causal_service_credentials_id_check CHECK (id = 1)
);

GRANT SELECT, INSERT, UPDATE ON TABLE causal_service_credentials TO causal_app;
