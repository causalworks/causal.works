-- 011_plaid_connections.sql
-- Plaid connections: link users to Plaid items (access tokens, institution info).
-- Run with: psql -U postgres -h localhost -d causal_db -f db/migrations/011_plaid_connections.sql

CREATE TABLE IF NOT EXISTS plaid_connections (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    item_id TEXT NOT NULL,
    institution_id TEXT,
    institution_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plaid_connections_user_id ON plaid_connections(user_id);
