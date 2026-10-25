-- 377: the workspace assistant's own seat (expiring, revocable, propose-only) and the Off/Background/Assistant mode settings.

CREATE TABLE org_assistant_seats (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (length(btrim(reason)) >= 5),
  granted_by integer REFERENCES users(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  renewed_at timestamptz,
  revoked_at timestamptz,
  revoked_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE UNIQUE INDEX org_assistant_seats_one_live ON org_assistant_seats (org_id) WHERE revoked_at IS NULL;

ALTER TABLE org_assistant_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_assistant_seats FORCE ROW LEVEL SECURITY;
CREATE POLICY org_assistant_seats_org_isolation ON org_assistant_seats
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_assistant_seats TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_assistant_seats_id_seq TO causal_app;
COMMENT ON TABLE org_assistant_seats IS 'The assistant''s own identity in a workspace: may propose, may not post; ends on a date and can be revoked.';

ALTER TABLE org_tool_proposals ADD COLUMN proposer_seat_id integer REFERENCES org_assistant_seats(id) ON DELETE SET NULL;

ALTER TABLE org_settings ADD COLUMN assistant_mode text NOT NULL DEFAULT 'off' CHECK (assistant_mode IN ('off', 'background', 'assistant'));
ALTER TABLE org_users ADD COLUMN assistant_mode text CHECK (assistant_mode IN ('off', 'background', 'assistant'));
