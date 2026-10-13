-- 056_user_org_petition_signatures.sql
-- Address mapping layer: track which users signed petitions for which orgs via which causal address

CREATE TABLE IF NOT EXISTS user_org_petition_signatures (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  causal_address_used TEXT NOT NULL,
  petition_url TEXT,
  signed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, org_id, petition_url)
);

CREATE INDEX IF NOT EXISTS idx_user_org_petition_signatures_user_org ON user_org_petition_signatures(user_id, org_id);
CREATE INDEX IF NOT EXISTS idx_user_org_petition_signatures_address ON user_org_petition_signatures(causal_address_used);
CREATE INDEX IF NOT EXISTS idx_user_org_petition_signatures_user_id ON user_org_petition_signatures(user_id);
CREATE INDEX IF NOT EXISTS idx_user_org_petition_signatures_org_id ON user_org_petition_signatures(org_id);
