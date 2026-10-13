-- 007_user_actions_opened_dismissed_seeded.sql
-- Track open/dismiss and seed flag for user_actions (no new log table; profile counters stay derived from user_actions).

ALTER TABLE user_actions
    ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;

ALTER TABLE user_actions
    ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

ALTER TABLE user_actions
    ADD COLUMN IF NOT EXISTS seeded BOOLEAN DEFAULT false;
