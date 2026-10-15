ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS acknowledgment_message text,
  ADD COLUMN IF NOT EXISTS acknowledgment_signoff text;
