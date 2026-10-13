-- A multi-year pledge needs to be discounted to present value. Funding flags it and may propose a rate and term;
-- Accounting sets or accepts the rate and term when posting the pledge, and the accepted values are then fixed.
ALTER TABLE org_gifts
  ADD COLUMN IF NOT EXISTS pledge_years numeric(5,2),
  ADD COLUMN IF NOT EXISTS discounting_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS discounting_accepted_by_user_id integer REFERENCES users(id) ON DELETE SET NULL;
