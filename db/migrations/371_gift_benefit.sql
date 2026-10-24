-- Gifts: what the donor received in return (null = nothing)
ALTER TABLE org_gifts
  ADD COLUMN IF NOT EXISTS benefit_description text,
  ADD COLUMN IF NOT EXISTS benefit_value_cents bigint;
ALTER TABLE org_gifts
  ADD CONSTRAINT org_gifts_benefit_value_check
  CHECK (benefit_value_cents IS NULL OR (benefit_value_cents >= 0 AND benefit_value_cents <= amount_cents)) NOT VALID;
ALTER TABLE org_gifts VALIDATE CONSTRAINT org_gifts_benefit_value_check;
