-- The organization's state (two-letter code), chosen in Organization settings (Org basics) and in onboarding.
-- Both screens already sent it, but nothing stored it.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE org_settings DROP CONSTRAINT IF EXISTS org_settings_state_check;
ALTER TABLE org_settings ADD CONSTRAINT org_settings_state_check CHECK (state IS NULL OR state ~ '^[A-Z]{2}$');
