-- 064: Add is_cooperative_admin flag to users table for Wave 2 admin UI

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_cooperative_admin BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_is_cooperative_admin ON users (is_cooperative_admin) WHERE is_cooperative_admin = TRUE;
