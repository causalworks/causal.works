-- 012_org_suggestions.sql
-- User-submitted org suggestions (onboarding / settings)

CREATE TABLE IF NOT EXISTS org_suggestions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_suggestions_user_id ON org_suggestions(user_id);
CREATE INDEX IF NOT EXISTS idx_org_suggestions_created_at ON org_suggestions(created_at);
