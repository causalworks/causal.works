-- Membership email: per-contact email preferences (unsubscribe), the message subject in the log, the list of workspaces
-- the daily job works through, and delivery and open reports from the email provider.

BEGIN;

CREATE TABLE IF NOT EXISTS org_contact_email_prefs (
  id               serial PRIMARY KEY,
  org_id           integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id   integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  scope            text NOT NULL DEFAULT 'membership' CHECK (scope IN ('membership', 'all')),
  unsubscribed_at  timestamptz NOT NULL DEFAULT now(),
  source           text,
  UNIQUE (constituent_id, scope)
);
ALTER TABLE org_contact_email_prefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_contact_email_prefs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_contact_email_prefs_org_isolation ON org_contact_email_prefs;
CREATE POLICY org_contact_email_prefs_org_isolation ON org_contact_email_prefs
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_contact_email_prefs TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_contact_email_prefs_id_seq TO causal_app;

ALTER TABLE org_membership_messages ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE org_membership_messages ADD COLUMN IF NOT EXISTS created_by integer REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS org_membership_messages_provider_idx ON org_membership_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

CREATE OR REPLACE FUNCTION org_membership_workspaces()
  RETURNS TABLE (org_id integer, slug text, display_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.slug::text, c.display_name::text
    FROM coop_members c JOIN org_settings s ON s.org_id = c.id
   WHERE s.membership_enabled AND c.deleted_at IS NULL
   ORDER BY c.id;
$$;
REVOKE ALL ON FUNCTION org_membership_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_membership_workspaces() TO causal_app;

CREATE OR REPLACE FUNCTION org_membership_message_event(p_message_id text, p_kind text, p_at timestamptz)
  RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n integer;
BEGIN
  IF p_kind = 'delivered' THEN
    UPDATE org_membership_messages SET delivered_at = COALESCE(delivered_at, p_at) WHERE provider_message_id = p_message_id;
  ELSIF p_kind = 'opened' THEN
    UPDATE org_membership_messages SET opened_at = COALESCE(opened_at, p_at), delivered_at = COALESCE(delivered_at, p_at) WHERE provider_message_id = p_message_id;
  ELSIF p_kind = 'bounced' THEN
    UPDATE org_membership_messages SET status = 'failed' WHERE provider_message_id = p_message_id;
  ELSE
    RETURN 0;
  END IF;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION org_membership_message_event(text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_membership_message_event(text, text, timestamptz) TO causal_app;

COMMIT;
