-- 018_actions_sender_metadata.sql
-- Persist inbound sender headers for auditable org resolution and historical backfills.

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS sender_email TEXT;

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS reply_to_email TEXT;

CREATE INDEX IF NOT EXISTS idx_actions_sender_email_lower
  ON actions (lower(sender_email))
  WHERE sender_email IS NOT NULL;

COMMENT ON COLUMN actions.sender_email IS 'Inbound From address (lowercase) at ingest; used to resolve org via domain + aliases.';
COMMENT ON COLUMN actions.reply_to_email IS 'Inbound Reply-To address (lowercase) when present; secondary signal for sender org.';
