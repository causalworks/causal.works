ALTER TABLE org_gifts
  ADD COLUMN IF NOT EXISTS not_gift_flagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS not_gift_flagged_by integer,
  ADD COLUMN IF NOT EXISTS not_gift_note text;
