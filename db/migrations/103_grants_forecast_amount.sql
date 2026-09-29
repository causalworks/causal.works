-- Migration 103: Forecast amount for grant tracker
-- forecast_amount_cents is the probability-adjusted estimate used for budget planning.
-- Distinct from request_amount (aspirational ask) and amount_cents (confirmed award).
ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS forecast_amount_cents integer;
