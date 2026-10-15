ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS mileage_rate_cents_per_mile numeric(7,3) CHECK (mileage_rate_cents_per_mile IS NULL OR mileage_rate_cents_per_mile > 0);
ALTER TABLE org_expense_claim_lines ALTER COLUMN rate_cents_per_mile TYPE numeric(7,3);
