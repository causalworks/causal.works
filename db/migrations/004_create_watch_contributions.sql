-- 004_create_watch_contributions.sql
-- Store "Add a local official" submissions from Watch (ROADMAP 2.2a)

CREATE TABLE IF NOT EXISTS watch_contributions (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    official_name TEXT NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_watch_contributions_user_id ON watch_contributions(user_id);
