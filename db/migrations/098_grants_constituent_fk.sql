-- Migration 098: constituent_id FK on coop_grants
-- Links each grant to its funder as a coop_constituents record.
-- Nullable: existing grants remain unlinked until connected via the Donors UI.
-- The funder text field remains for legacy display.

ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS constituent_id INTEGER
    REFERENCES coop_constituents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coop_grants_constituent
  ON coop_grants(constituent_id)
  WHERE constituent_id IS NOT NULL;
