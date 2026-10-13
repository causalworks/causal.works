-- 032_bank_pledges.sql — self-reported “consider switching” pledges for flagged banks
CREATE TABLE IF NOT EXISTS bank_pledges (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_name TEXT NOT NULL,
    pledge_amount INTEGER,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, institution_name)
);

CREATE INDEX IF NOT EXISTS idx_bank_pledges_institution_name
    ON bank_pledges(institution_name);
