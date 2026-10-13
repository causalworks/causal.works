-- Saved Invest tab ticker list (JSON array of uppercase symbols), per user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS invest_tickers jsonb DEFAULT '[]'::jsonb;
