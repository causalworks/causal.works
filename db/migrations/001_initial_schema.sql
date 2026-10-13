-- migration-001.sql
-- Run with: sudo -u postgres psql causal_db -f migration-001.sql

-- 1. Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    forwarding_address VARCHAR(255) UNIQUE NOT NULL,
    location VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Sessions table (for magic link auth)
CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE
);

-- 3. User actions join table
CREATE TABLE user_actions (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    action_id INT REFERENCES actions(id) ON DELETE CASCADE,
    received_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    UNIQUE(user_id, action_id)
);

-- 4. Add user_id to actions (nullable — existing rows stay intact)
ALTER TABLE actions ADD COLUMN user_id INT REFERENCES users(id) ON DELETE SET NULL;

-- 5. Index for common queries
CREATE INDEX idx_actions_user_id ON actions(user_id);
CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_user_actions_user_id ON user_actions(user_id);