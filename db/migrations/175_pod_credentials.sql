-- 175: Per-org (and one coop-level) encrypted Solid pod credentials.
--
-- Replaces the single shared CSS_POD_ADMIN_EMAIL/PASSWORD credential (which
-- gave the platform standing read/write access to every org's pod at once -
-- see DevPath rev 55) with a dedicated, isolated credential per pod. Each
-- credential is AES-256-GCM encrypted at rest with one root key
-- (POD_CREDENTIAL_ENCRYPTION_KEY in .env) - see server/organizational/lib/
-- podCredentialCrypto.js. This does not fully eliminate .env as a factor: a
-- leaked root key plus DB access still exposes every credential. What it does
-- change is the blast radius of a *DB-only* compromise (ciphertext alone is
-- useless) and, more importantly, removes the single-shared-login problem -
-- there is no longer one login that owns every org's pod.
--
-- Two separate tables, not one generic "entity type" table:
-- org_pod_credentials is genuinely org-shaped (FORCE RLS keyed on org_id,
-- same isolation model as every other org_* table). The coop pod is a
-- singleton with no owning org and no org-scoped RLS policy that would even
-- make sense for it - gated purely by platform-admin checks in application
-- code, same as the rest of the coop-wide Pod Management surface. Forcing
-- both into one nullable-org_id table would have made the org table's RLS
-- policy either leak the coop row or need a special-case exception - not
-- worth it for exactly one extra row.

CREATE TABLE org_pod_credentials (
    org_id integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE org_pod_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_pod_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY org_pod_credentials_org_isolation ON org_pod_credentials
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org_pod_credentials TO causal_app;

CREATE TABLE coop_pod_credentials (
    id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
    account_email text NOT NULL,
    encrypted_password text NOT NULL,
    encryption_iv text NOT NULL,
    encryption_auth_tag text NOT NULL,
    pod_webid text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE coop_pod_credentials TO causal_app;
