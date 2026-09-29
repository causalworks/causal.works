-- Migration 100: Add funder_grant_id to coop_grants
-- Stores the reference number/code assigned by the funder (distinct from our internal grant_code)
ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS funder_grant_id text;

CREATE INDEX IF NOT EXISTS idx_coop_grants_funder_grant_id
  ON coop_grants(coop_org_id, funder_grant_id)
  WHERE funder_grant_id IS NOT NULL;
