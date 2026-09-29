-- 093_budget_source.sql
-- Add budget_source to coop_accounts: controls which module owns a posting account's budget data.
-- Default 'schedule' = in-grid sub-row scheduling (no change to existing accounts).

ALTER TABLE coop_accounts
  ADD COLUMN IF NOT EXISTS budget_source TEXT NOT NULL DEFAULT 'schedule'
  CONSTRAINT coop_accounts_budget_source_chk
    CHECK (budget_source IN ('schedule', 'personnel', 'grant_allocation', 'insurance', 'input'));

COMMENT ON COLUMN coop_accounts.budget_source IS
  'schedule=in-grid sub-rows | personnel=Personnel tab | grant_allocation=Grants page | insurance=Insurance tab | input=direct cell edit';
