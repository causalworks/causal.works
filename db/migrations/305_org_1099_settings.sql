-- 305: Company settings for 1099 reporting. reports_1099 switches 1099 tracking on or off for the org;
-- threshold_1099_cents lets an org report vendors at a LOWER amount than the legal threshold (never higher).
-- NULL means "use the legal amount for the payment year" (kept in server code by year).
ALTER TABLE org_settings
  ADD COLUMN reports_1099 boolean NOT NULL DEFAULT true,
  ADD COLUMN threshold_1099_cents integer CHECK (threshold_1099_cents IS NULL OR threshold_1099_cents >= 0);
