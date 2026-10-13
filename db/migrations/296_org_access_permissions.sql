-- Access permissions (2026-10-04): read-only access to Accounting for members whose role would otherwise see nothing
-- (board, fundraising), either ongoing or for 30 days (renewable). Layered over a member's role; never allows changes.
-- Not to be confused with funder grants (org_grants) or program grants (org_program_grants).
--   reports         financial statements, trial balance, general ledger, budget vs actual, board and funder reports
--   accounting_read everything under Accounting, read-only (includes reports)
-- ends_at NULL = ongoing (standing). A permission is active while revoked_at IS NULL and (ends_at IS NULL or ends_at > now()),
-- checked on each request, so nothing needs a scheduled job and nothing can go stale.
-- org_settings.finance_can_give_access / finance_giveable_permissions let an admin allow finance to give some of these.

CREATE TABLE IF NOT EXISTS org_access_permissions (
  id                 serial PRIMARY KEY,
  org_id             integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  org_user_id        integer NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
  permission         text NOT NULL CHECK (permission IN ('reports', 'accounting_read')),
  reason             text NOT NULL CHECK (length(btrim(reason)) >= 5),
  ends_at            timestamptz,
  given_by_user_id   integer REFERENCES users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  renewed_at         timestamptz,
  revoked_at         timestamptz,
  revoked_by_user_id integer REFERENCES users(id) ON DELETE SET NULL
);

-- At most one open permission of each kind per member; renewing extends ends_at on that row.
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_access_permissions_open
  ON org_access_permissions (org_user_id, permission) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_org_access_permissions_org ON org_access_permissions (org_id);

ALTER TABLE org_access_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_access_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_access_permissions_org_isolation ON org_access_permissions;
CREATE POLICY org_access_permissions_org_isolation ON org_access_permissions
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_access_permissions TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_access_permissions_id_seq TO causal_app;

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS finance_can_give_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finance_giveable_permissions text[] NOT NULL DEFAULT '{}';
