-- Shared public module: links that open one narrow public page without signing in (only a hash of each token is stored),
-- a log of every use, the per-workspace public settings (optional challenge check), and the opt-in public project page.

CREATE TABLE IF NOT EXISTS org_public_links (
  id                    serial PRIMARY KEY,
  org_id                integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  purpose               text NOT NULL,
  constituent_id        integer REFERENCES org_constituents(id) ON DELETE CASCADE,
  sponsored_project_id  integer REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  token_hash            text NOT NULL UNIQUE,
  single_use            boolean NOT NULL DEFAULT false,
  expires_at            timestamptz NOT NULL,
  used_at               timestamptz,
  revoked_at            timestamptz,
  revoked_by            integer,
  revoke_reason         text,
  label                 text,
  created_by            integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  last_used_at          timestamptz,
  CHECK (purpose ~ '^[a-z_]+$')
);
CREATE INDEX IF NOT EXISTS org_public_links_project_idx ON org_public_links (sponsored_project_id) WHERE sponsored_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_public_links_contact_idx ON org_public_links (constituent_id) WHERE constituent_id IS NOT NULL;

ALTER TABLE org_public_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_public_links FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_public_links_org_isolation ON org_public_links;
CREATE POLICY org_public_links_org_isolation ON org_public_links
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_public_links_program_scope ON org_public_links;
CREATE POLICY org_public_links_program_scope ON org_public_links AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR sponsored_project_id IS NULL OR EXISTS (
    SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())));
GRANT SELECT, INSERT, UPDATE ON org_public_links TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_public_links_id_seq TO causal_app;

CREATE TABLE IF NOT EXISTS org_public_link_uses (
  id          bigserial PRIMARY KEY,
  org_id      integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  link_id     integer NOT NULL REFERENCES org_public_links(id) ON DELETE CASCADE,
  action      text NOT NULL,
  ip_hash     text,
  used_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_public_link_uses_link_idx ON org_public_link_uses (link_id, used_at);
ALTER TABLE org_public_link_uses ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_public_link_uses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_public_link_uses_org_isolation ON org_public_link_uses;
CREATE POLICY org_public_link_uses_org_isolation ON org_public_link_uses
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT ON org_public_link_uses TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_public_link_uses_id_seq TO causal_app;

CREATE TABLE IF NOT EXISTS org_public_settings (
  org_id                  integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
  challenge_verify_url    text,
  challenge_site_key      text,
  challenge_secret_enc    text,
  challenge_secret_iv     text,
  challenge_secret_tag    text,
  updated_by              integer,
  updated_at              timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_public_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_public_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_public_settings_org_isolation ON org_public_settings;
CREATE POLICY org_public_settings_org_isolation ON org_public_settings
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_public_settings TO causal_app;

ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS public_page_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS public_summary text;
