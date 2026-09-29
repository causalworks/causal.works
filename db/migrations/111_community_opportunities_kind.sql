-- 111: generalize volunteer_opportunities to also hold local-action suggestions
ALTER TABLE volunteer_opportunities ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'volunteer';

ALTER TABLE volunteer_opportunities DROP CONSTRAINT IF EXISTS volunteer_opportunities_kind_check;
ALTER TABLE volunteer_opportunities ADD CONSTRAINT volunteer_opportunities_kind_check
  CHECK (kind IN ('volunteer', 'local_action'));
