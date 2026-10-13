-- Fixed asset settings: purchases below this amount are expensed, not tracked as assets. Default $5,000.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS capitalization_threshold_cents integer NOT NULL DEFAULT 500000 CHECK (capitalization_threshold_cents >= 0);
