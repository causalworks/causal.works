-- Migration 094: Add revenue_account_id FK to coop_grants
-- Links a grant to the income account in the COA that receives its revenue.
-- When set, grantRecalc writes monthly budget lines for that account.
-- Nullable: not all grants need to be reflected in the budget grid.

ALTER TABLE coop_grants
  ADD COLUMN revenue_account_id INTEGER REFERENCES coop_accounts(id);

CREATE INDEX idx_coop_grants_revenue_account ON coop_grants(revenue_account_id)
  WHERE revenue_account_id IS NOT NULL;
