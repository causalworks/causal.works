-- 020_create_user_contributed_orgs.sql
-- User-declared organizations they contribute to, with optional ProPublica metadata.

CREATE TABLE IF NOT EXISTS user_contributed_orgs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_name TEXT NOT NULL,
  ein TEXT,
  propublica_verified BOOLEAN NOT NULL DEFAULT false,
  city TEXT,
  state TEXT,
  ntee_code TEXT,
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_contributed_orgs_user_id
  ON user_contributed_orgs(user_id);

CREATE INDEX IF NOT EXISTS idx_user_contributed_orgs_added_at
  ON user_contributed_orgs(added_at DESC);
