-- 079: Create volunteer_opportunities table
-- Stores user-submitted volunteer opportunities for moderation and listing

CREATE TABLE IF NOT EXISTS volunteer_opportunities (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  location TEXT,
  description TEXT,
  submitted_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_volunteer_opportunities_approved ON volunteer_opportunities(approved, created_at DESC);
CREATE INDEX idx_volunteer_opportunities_user_id ON volunteer_opportunities(submitted_by_user_id);
