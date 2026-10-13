-- Chart of accounts management: a short description per account (shown in the chart and pickers) and archiving,
-- so an account no longer used can be hidden from pickers without losing its history.
ALTER TABLE org_accounts
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_org_accounts_org_archived ON org_accounts (org_id) WHERE archived_at IS NULL;
