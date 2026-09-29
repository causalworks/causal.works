-- Migration 083: Budget source tracking + schedule items
-- Adds source attribution to budget lines (manual vs. personnel vs. schedule vs. grant)
-- and creates coop_schedule_items for DIY schedule builder

-- ── Source tracking on existing budget lines ───────────────────────────────

ALTER TABLE coop_budget_lines
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual','personnel','insurance','schedule','grant_allocation','indirect_cost','prior_year')),
  ADD COLUMN IF NOT EXISTS source_ref_id   BIGINT,
  ADD COLUMN IF NOT EXISTS source_ref_type TEXT,
  ADD COLUMN IF NOT EXISTS is_override              BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS override_amount_cents     BIGINT,
  ADD COLUMN IF NOT EXISTS calculated_amount_cents   BIGINT,
  ADD COLUMN IF NOT EXISTS source_updated_at         TIMESTAMPTZ;

COMMENT ON COLUMN coop_budget_lines.source_type IS
  'Origin of this line: manual (user-typed), personnel, insurance, schedule, grant_allocation, indirect_cost, prior_year';
COMMENT ON COLUMN coop_budget_lines.is_override IS
  'TRUE when user manually typed a value over a calculated line; recalc skips this row';
COMMENT ON COLUMN coop_budget_lines.override_amount_cents IS
  'User-typed override value (stored separately from calculated_amount_cents)';
COMMENT ON COLUMN coop_budget_lines.calculated_amount_cents IS
  'Last value pushed by the source calculator; null for manual lines';
COMMENT ON COLUMN coop_budget_lines.source_updated_at IS
  'When the source record last changed; used to detect stale calculated values';

-- ── Schedule items table ───────────────────────────────────────────────────
-- Sub-rows within a named schedule (personnel, insurance, stipend lists, etc.)
-- Each item computes a monthly spread into coop_budget_lines on save.

CREATE TABLE IF NOT EXISTS coop_schedule_items (
  id                BIGSERIAL PRIMARY KEY,
  coop_org_id       INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  account_id        INTEGER REFERENCES coop_accounts(id) ON DELETE SET NULL,
  program_id        INTEGER REFERENCES coop_programs(id) ON DELETE SET NULL,
  grant_id          INTEGER REFERENCES coop_grants(id) ON DELETE SET NULL,
  fiscal_year       INTEGER NOT NULL,
  label             TEXT NOT NULL,
  schedule_type     TEXT NOT NULL DEFAULT 'custom'
                    CHECK (schedule_type IN (
                      'personnel','insurance','stipend',
                      'grant_milestone','indirect_cost','custom'
                    )),
  quantity          NUMERIC NOT NULL DEFAULT 1,
  unit_amount_cents BIGINT  NOT NULL DEFAULT 0,

  -- Standard fund-accounting timing model: 4 fields cover all distribution cases
  frequency         TEXT NOT NULL DEFAULT 'monthly'
                    CHECK (frequency IN (
                      'monthly','quarterly','annual','one_time','custom_months'
                    )),
  -- For custom_months: array of month numbers (1=Jan … 12=Dec)
  active_months     SMALLINT[],
  -- For monthly/quarterly: inclusive range within fiscal year
  start_month       SMALLINT NOT NULL DEFAULT 1,
  end_month         SMALLINT NOT NULL DEFAULT 12,

  -- Optional back-link to source record (e.g. coop_personnel row)
  source_ref_id     BIGINT,
  source_ref_type   TEXT,

  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coop_schedule_items_org_fy
  ON coop_schedule_items (coop_org_id, fiscal_year);

CREATE INDEX IF NOT EXISTS idx_coop_schedule_items_account
  ON coop_schedule_items (account_id);

COMMENT ON TABLE coop_schedule_items IS
  'Sub-rows within named budget schedules. Each item computes monthly spread → coop_budget_lines on save.';
COMMENT ON COLUMN coop_schedule_items.frequency IS
  'monthly=every month in range, quarterly=months 1/4/7/10 of range, annual=one payment, one_time=single month, custom_months=use active_months array';
COMMENT ON COLUMN coop_schedule_items.active_months IS
  'Month numbers (1–12) when this item is active. Required when frequency=custom_months.';
