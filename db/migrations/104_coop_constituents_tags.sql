-- 104: Free-form tags on constituents (funders/donors)
-- User-defined, not a fixed enum — unlike coop_orgs.cooperative_turnarounds, no CHECK constraint.

ALTER TABLE coop_constituents ADD COLUMN IF NOT EXISTS tags text[];

CREATE INDEX IF NOT EXISTS idx_coop_constituents_tags
  ON coop_constituents USING GIN (tags);
