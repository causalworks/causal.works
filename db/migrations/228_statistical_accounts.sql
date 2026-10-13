-- Statistical accounts (Tier 5 of the 2026-09-13 comprehensive plan): non-dollar KPIs
-- (clients served, meals delivered) alongside financial accounts. An explicit boolean flag,
-- not a new `org_account_type` enum value -- the plan's own reasoning after the sweep found
-- two real unfiltered-sum gaps on the first pass: an explicit, differently-named flag is
-- harder for a query to silently forget to check than one more value in a 5-value enum most
-- code already pattern-matches against. Every dollar-summing consumer of org_accounts must
-- now explicitly exclude is_statistical = true, not assume "everything under this rollup
-- root is a dollar amount."
ALTER TABLE public.org_accounts
  ADD COLUMN is_statistical boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_accounts.is_statistical IS
  'True for non-dollar KPI accounts (clients served, meals delivered) tracked alongside financial accounts via the same org_budget_lines/org_actuals machinery. Every query that sums dollar amounts across accounts must exclude these explicitly -- do not rely on type filtering alone.';
