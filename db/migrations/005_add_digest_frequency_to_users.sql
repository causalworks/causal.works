-- 005_add_digest_frequency_to_users.sql
-- Add digest columns so requireAuth and /api/me work without fallback

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS digest_frequency TEXT DEFAULT 'off';

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS digest_last_sent_at TIMESTAMPTZ;
