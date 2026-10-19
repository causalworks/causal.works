-- Membership join requests from the public join form: held until the email address is confirmed (and, where the
-- workspace asks for it, approved by staff); the submitted details are cleared once the contact and term exist.

BEGIN;

CREATE TABLE IF NOT EXISTS org_membership_join_requests (
  id                     serial PRIMARY KEY,
  org_id                 integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  status                 text NOT NULL DEFAULT 'unconfirmed'
                           CHECK (status IN ('unconfirmed', 'awaiting_approval', 'accepted', 'declined')),
  kind                   text NOT NULL DEFAULT 'individual' CHECK (kind IN ('individual', 'organization')),
  email                  text,
  details                jsonb NOT NULL DEFAULT '{}'::jsonb,
  tier_id                integer REFERENCES org_membership_tiers(id),
  price_cents            integer CHECK (price_cents IS NULL OR price_cents >= 0),
  eligibility_confirmed  boolean NOT NULL DEFAULT false,
  extra_gift_cents       integer NOT NULL DEFAULT 0 CHECK (extra_gift_cents >= 0),
  link_id                integer REFERENCES org_public_links(id) ON DELETE SET NULL,
  constituent_id         integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  term_id                integer REFERENCES org_membership_terms(id) ON DELETE SET NULL,
  gift_id                integer REFERENCES org_gifts(id) ON DELETE SET NULL,
  decided_by             integer REFERENCES users(id) ON DELETE SET NULL,
  decision_reason        text,
  ip_hash                text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  confirmed_at           timestamptz,
  decided_at             timestamptz,
  CHECK (status <> 'declined' OR length(btrim(COALESCE(decision_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS org_membership_join_requests_status_idx ON org_membership_join_requests (org_id, status);

ALTER TABLE org_membership_join_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_join_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_join_requests_org_isolation ON org_membership_join_requests;
CREATE POLICY org_membership_join_requests_org_isolation ON org_membership_join_requests
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_join_requests TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_join_requests_id_seq TO causal_app;

COMMIT;
