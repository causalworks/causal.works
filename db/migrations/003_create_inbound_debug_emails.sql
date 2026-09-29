-- Creates a short-lived debug store for inbound email payloads.
-- Safe to run multiple times.
CREATE TABLE IF NOT EXISTS inbound_debug_emails (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE SET NULL,
    message_id TEXT,
    from_email TEXT,
    to_email TEXT,
    subject TEXT,
    best_url TEXT,
    top_urls JSONB,
    text_body TEXT,
    html_body TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inbound_debug_emails_created_at
  ON inbound_debug_emails(created_at);
