-- A program or project lead asks to change how a grant is split to their program; a person who manages Funding
-- accepts (which applies the change to org_grant_allocations) or declines with a note.
CREATE TABLE IF NOT EXISTS org_grant_allocation_requests (
  id                 serial PRIMARY KEY,
  org_id             integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  grant_id           integer NOT NULL REFERENCES org_grants(id) ON DELETE CASCADE,
  coop_program_id    integer NOT NULL REFERENCES org_programs(id) ON DELETE CASCADE,
  fiscal_year        integer NOT NULL CHECK (fiscal_year BETWEEN 1900 AND 2200),
  amount_cents       integer NOT NULL CHECK (amount_cents >= 0),
  note               text,
  status             text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  requested_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  decided_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
  decided_at         timestamptz,
  decision_note      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_grant_alloc_requests_grant ON org_grant_allocation_requests (grant_id, status);
CREATE INDEX IF NOT EXISTS idx_org_grant_alloc_requests_org ON org_grant_allocation_requests (org_id, status);

ALTER TABLE org_grant_allocation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_grant_allocation_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_grant_allocation_requests_org_isolation ON org_grant_allocation_requests;
CREATE POLICY org_grant_allocation_requests_org_isolation ON org_grant_allocation_requests
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_grant_allocation_requests_program_scope ON org_grant_allocation_requests;
CREATE POLICY org_grant_allocation_requests_program_scope ON org_grant_allocation_requests AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR coop_program_id = ANY (current_program_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON org_grant_allocation_requests TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_grant_allocation_requests_id_seq TO causal_app;
