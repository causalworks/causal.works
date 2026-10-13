-- 016_civic_identity_addresses.sql
-- Civic identity address system: aliases, pending confirmations, and contributions.

CREATE TABLE IF NOT EXISTS user_addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  address TEXT UNIQUE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_is_primary ON user_addresses(user_id, is_primary);

CREATE TABLE IF NOT EXISTS pending_confirmations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  org_name TEXT,
  confirmation_url TEXT NOT NULL,
  email_subject TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pending_confirmations_user_id_created
  ON pending_confirmations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_confirmations_unconfirmed
  ON pending_confirmations(user_id, confirmed_at);

CREATE TABLE IF NOT EXISTS contributions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  org_name TEXT,
  amount_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  contributed_at TIMESTAMPTZ,
  source TEXT DEFAULT 'receipt',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contributions_user_org_date
  ON contributions(user_id, org_name, contributed_at DESC);

-- Backfill existing users' current forwarding address into aliases.
INSERT INTO user_addresses (user_id, address, is_primary)
SELECT id, forwarding_address, true
FROM users
WHERE forwarding_address IS NOT NULL
ON CONFLICT (address) DO NOTHING;
