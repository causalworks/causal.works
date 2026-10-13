-- 112: first-run onboarding tracking (bank-first wizard, progressive unlock, return-visit summary)
ALTER TABLE users ADD COLUMN IF NOT EXISTS fund_holdings_flag boolean;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_payoff_seen_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS visited_financial_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_visit_at timestamptz;
