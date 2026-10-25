-- 376: proposals made by an assistant or a job for a person to run, stored until decided.

CREATE TABLE org_tool_proposals (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  tool_name text NOT NULL,
  proposer_kind text NOT NULL CHECK (proposer_kind IN ('assistant', 'job')),
  proposer_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  model text,
  prompt_version text,
  input jsonb NOT NULL,
  reason text,
  evidence jsonb,
  warnings jsonb,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'accepted', 'changed', 'dismissed', 'expired')),
  decided_by integer REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  final_input jsonb,
  result_status integer,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '30 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX org_tool_proposals_open_idx ON org_tool_proposals (org_id, status, created_at);

ALTER TABLE org_tool_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_tool_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY org_tool_proposals_org_isolation ON org_tool_proposals
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE ON org_tool_proposals TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_tool_proposals_id_seq TO causal_app;
COMMENT ON TABLE org_tool_proposals IS 'Tool calls an assistant or job proposed; nothing changes until a person accepts.';
