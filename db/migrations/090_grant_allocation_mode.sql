-- Migration 090: Add allocation_mode to coop_grants
-- Determines whether the panel renders allocation inputs as dollar amounts or
-- percentages of the grant award. Stored value is always amount_cents; mode is
-- a UI hint only.

ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS allocation_mode VARCHAR(10) NOT NULL DEFAULT 'amount'
  CONSTRAINT coop_grants_allocation_mode_check
    CHECK (allocation_mode IN ('amount', 'percent'));
