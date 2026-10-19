-- Membership directory, gated documents and seats: a document visibility for dues members, each contact's directory
-- opt-in (which fields, public or only for dues members), the directory switch, and one open seat per person per term.

ALTER TYPE org_document_visibility ADD VALUE IF NOT EXISTS 'dues_members';

BEGIN;

ALTER TABLE org_membership_settings ADD COLUMN IF NOT EXISTS directory_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS org_membership_directory_optin (
  id               serial PRIMARY KEY,
  org_id           integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id   integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  fields           text[] NOT NULL DEFAULT '{}',
  visibility       text NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private')),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (constituent_id)
);
ALTER TABLE org_membership_directory_optin ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_directory_optin FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_directory_optin_org_isolation ON org_membership_directory_optin;
CREATE POLICY org_membership_directory_optin_org_isolation ON org_membership_directory_optin
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_membership_directory_optin TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_directory_optin_id_seq TO causal_app;

CREATE UNIQUE INDEX IF NOT EXISTS org_membership_seats_open_key ON org_membership_seats (term_id, constituent_id) WHERE ends_on IS NULL;

COMMIT;
