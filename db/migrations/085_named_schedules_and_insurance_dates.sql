-- Migration 085: Named schedule groups + insurance policy date columns
-- Creates coop_schedules parent table for user-named schedule groups (event budgets, etc.)
-- Adds policy_start_date / policy_end_date to coop_schedule_items for day-accurate insurance proration

-- ── Named schedule groups ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coop_schedules (
  id            BIGSERIAL PRIMARY KEY,
  coop_org_id   INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  fiscal_year   INTEGER NOT NULL,
  name          TEXT    NOT NULL,
  schedule_type TEXT    NOT NULL DEFAULT 'custom'
    CHECK (schedule_type IN ('event','custom','depreciation','amortization')),
  status        TEXT    NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','active','locked','reconciled','audit_ready')),
  notes         TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (coop_org_id, fiscal_year, name)
);

CREATE INDEX IF NOT EXISTS idx_coop_schedules_org_fy
  ON coop_schedules (coop_org_id, fiscal_year);

COMMENT ON TABLE coop_schedules IS
  'User-named schedule groups for the Other Schedules tab. Items FK here via named_schedule_id.';
COMMENT ON COLUMN coop_schedules.status IS
  'Lifecycle: draft → active → locked (months closed) → reconciled (vs GL) → audit_ready';

-- ── Insurance policy dates + schedule group FK on items ────────────────────────

ALTER TABLE coop_schedule_items
  ADD COLUMN IF NOT EXISTS named_schedule_id BIGINT REFERENCES coop_schedules(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS policy_start_date  DATE,
  ADD COLUMN IF NOT EXISTS policy_end_date    DATE;

CREATE INDEX IF NOT EXISTS idx_coop_schedule_items_named
  ON coop_schedule_items (named_schedule_id)
  WHERE named_schedule_id IS NOT NULL;

COMMENT ON COLUMN coop_schedule_items.named_schedule_id IS
  'Parent named schedule (Other Schedules tab grouping). NULL = ungrouped or insurance item.';
COMMENT ON COLUMN coop_schedule_items.policy_start_date IS
  'Insurance: actual policy start date. When set, recalc uses day-accurate proration instead of start_month/end_month.';
COMMENT ON COLUMN coop_schedule_items.policy_end_date IS
  'Insurance: actual policy end date for day-accurate proration.';
