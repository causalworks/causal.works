-- User receipts for mail sent to numeric user addresses (e.g. 314@causal.work)

CREATE TABLE IF NOT EXISTS user_inbound_emails (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_id INTEGER REFERENCES actions(id) ON DELETE SET NULL,
  message_id TEXT UNIQUE,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  from_address TEXT,
  from_name TEXT,
  to_address TEXT,
  subject TEXT,
  preview TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_inbound_emails_user_id ON user_inbound_emails(user_id);
CREATE INDEX IF NOT EXISTS idx_user_inbound_emails_received_at ON user_inbound_emails(received_at DESC);
