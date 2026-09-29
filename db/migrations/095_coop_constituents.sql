-- 095: Constituent CRM parent record
-- Covers foundations, individual donors, board members, prospects, member orgs.
-- coop_grants.funder (free text) links here via manual match UI, not automatic FK.

CREATE TABLE IF NOT EXISTS coop_constituents (
  id                    SERIAL PRIMARY KEY,
  coop_org_id           INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  type                  VARCHAR(30) NOT NULL DEFAULT 'individual'
                          CHECK (type IN ('foundation','individual','board','prospect','member_org')),
  display_name          TEXT NOT NULL,
  first_name            TEXT,
  last_name             TEXT,
  email                 TEXT,
  phone                 VARCHAR(50),
  mailing_address       TEXT,
  website               TEXT,
  xero_contact_id       TEXT,
  notes                 TEXT,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coop_constituents_org
  ON coop_constituents(coop_org_id);

CREATE INDEX IF NOT EXISTS idx_coop_constituents_type
  ON coop_constituents(coop_org_id, type);

CREATE INDEX IF NOT EXISTS idx_coop_constituents_xero
  ON coop_constituents(xero_contact_id)
  WHERE xero_contact_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_constituents_xero_unique
  ON coop_constituents(coop_org_id, xero_contact_id)
  WHERE xero_contact_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_coop_constituents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_coop_constituents_updated_at ON coop_constituents;
CREATE TRIGGER trigger_coop_constituents_updated_at
  BEFORE UPDATE ON coop_constituents
  FOR EACH ROW EXECUTE FUNCTION update_coop_constituents_updated_at();
