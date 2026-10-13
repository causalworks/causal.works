-- Migration 089: Unique composite index on coop_budget_lines
-- Prevents duplicate rows for the same org/account/program/grant/activity/year/month combination.
-- COALESCE(col, 0) so NULLs compare as equal in the index.

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_lines_composite_key
  ON coop_budget_lines (
    coop_org_id,
    account_id,
    COALESCE(program_id,    0),
    COALESCE(grant_id,      0),
    COALESCE(activity_id,   0),
    fiscal_year,
    month
  );
