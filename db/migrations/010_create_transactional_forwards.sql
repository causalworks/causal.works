-- 010_create_transactional_forwards.sql
-- Log transactional email forwards (confirmations, receipts, etc.) for audit.

CREATE TABLE IF NOT EXISTS transactional_forwards (
    id SERIAL PRIMARY KEY,
    causal_address TEXT NOT NULL,
    real_address TEXT NOT NULL,
    subject TEXT,
    from_email TEXT,
    match_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_transactional_forwards_created_at ON transactional_forwards(created_at);
