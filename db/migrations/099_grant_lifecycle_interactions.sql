-- Migration 099: interaction log on funder records + grant lifecycle date fields

-- Structured relationship history: meetings, calls, emails, notes on funder constituents.
-- Mirrors the "constituent timeline" pattern common in donor-CRM software.
CREATE TABLE IF NOT EXISTS coop_constituent_interactions (
  id                SERIAL PRIMARY KEY,
  coop_org_id       INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  constituent_id    INTEGER NOT NULL REFERENCES coop_constituents(id) ON DELETE CASCADE,
  grant_id          INTEGER REFERENCES coop_grants(id) ON DELETE SET NULL,
  interaction_type  VARCHAR(20) NOT NULL DEFAULT 'note'
                      CHECK (interaction_type IN ('meeting','call','email','note','site_visit')),
  interaction_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  description       TEXT NOT NULL,
  recorded_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coop_interactions_constituent
  ON coop_constituent_interactions(constituent_id);

CREATE INDEX IF NOT EXISTS idx_coop_interactions_org
  ON coop_constituent_interactions(coop_org_id, interaction_date DESC);

-- Grant lifecycle date fields for full application-to-close tracking.
-- Matches lifecycle stages common in grant-management software:
-- LOI → Application → Award → Active period → Closure
ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS loi_submitted_at         DATE,
  ADD COLUMN IF NOT EXISTS application_submitted_at DATE,
  ADD COLUMN IF NOT EXISTS award_date               DATE,
  ADD COLUMN IF NOT EXISTS period_start_date        DATE,
  ADD COLUMN IF NOT EXISTS period_end_date          DATE;

COMMENT ON COLUMN coop_grants.loi_submitted_at         IS 'Date letter of intent was submitted to funder';
COMMENT ON COLUMN coop_grants.application_submitted_at IS 'Date full application was submitted';
COMMENT ON COLUMN coop_grants.award_date               IS 'Date grant was officially awarded';
COMMENT ON COLUMN coop_grants.period_start_date        IS 'Start of grant performance period';
COMMENT ON COLUMN coop_grants.period_end_date          IS 'End of grant performance period (used for FY coverage calculation)';
