-- Track first login per user so we can alert on it (guyyarden+first-login alert).
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_login_at timestamptz;
