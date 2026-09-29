-- Migration 084: FASB ASU 2016-14 functional expense classification
-- Required for 990 Part IX: every expense account split across
-- program services / management & general / fundraising (must sum to 100%).
-- Stored as basis points (0–10000) to avoid floating-point rounding.

CREATE TABLE IF NOT EXISTS coop_functional_classifications (
  id                      BIGSERIAL PRIMARY KEY,
  coop_org_id             INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  account_id              INTEGER NOT NULL REFERENCES coop_accounts(id) ON DELETE CASCADE,
  fiscal_year             INTEGER NOT NULL,

  -- Basis points (sum must equal 10000 = 100.00%)
  program_services_bps    INTEGER NOT NULL DEFAULT 0,
  mgmt_general_bps        INTEGER NOT NULL DEFAULT 0,
  fundraising_bps         INTEGER NOT NULL DEFAULT 0,

  notes                   TEXT,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (coop_org_id, account_id, fiscal_year),
  CONSTRAINT functional_class_bps_sum
    CHECK (program_services_bps + mgmt_general_bps + fundraising_bps = 10000),
  CONSTRAINT functional_class_nonnegative
    CHECK (program_services_bps >= 0 AND mgmt_general_bps >= 0 AND fundraising_bps >= 0)
);

CREATE INDEX IF NOT EXISTS idx_coop_functional_class_org_fy
  ON coop_functional_classifications (coop_org_id, fiscal_year);

COMMENT ON TABLE coop_functional_classifications IS
  'FASB ASU 2016-14 functional expense splits per account per year. Feeds 990 Part IX. Values in basis points (10000 = 100%).';
COMMENT ON COLUMN coop_functional_classifications.program_services_bps IS
  'Portion allocated to program services, in basis points (e.g. 7000 = 70%)';
COMMENT ON COLUMN coop_functional_classifications.mgmt_general_bps IS
  'Portion allocated to management & general, in basis points';
COMMENT ON COLUMN coop_functional_classifications.fundraising_bps IS
  'Portion allocated to fundraising, in basis points';
