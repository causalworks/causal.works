-- 135: Add optional display_name/display_email overrides to workshop_space_members
-- and workshop_messages. Seed-data workshops (132/133) point user_id at real
-- platform accounts (a required NOT NULL FK) purely to satisfy referential
-- integrity, but showing those accounts' real personal email addresses as
-- "coalition members" in demo content is wrong — these columns let the API
-- prefer a fictional role-based name + fake address instead, without needing
-- real placeholder user accounts.

ALTER TABLE workshop_space_members
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS display_email TEXT;

ALTER TABLE workshop_messages
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS display_email TEXT;
