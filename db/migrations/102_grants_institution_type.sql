-- Migration 102: Institution type for grant tracker
-- Stores the funder category (Foundation, Government, Corporate, etc.) separate from grant_type (restricted/unrestricted)
ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS institution_type text;

CREATE INDEX IF NOT EXISTS idx_coop_grants_institution_type
  ON coop_grants(coop_org_id, institution_type)
  WHERE institution_type IS NOT NULL;
