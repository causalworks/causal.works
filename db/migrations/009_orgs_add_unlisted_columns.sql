-- 009_orgs_add_unlisted_columns.sql
-- Add columns for user-added unlisted orgs: ProPublica validation, EIN, admin validation.

ALTER TABLE orgs
    ADD COLUMN IF NOT EXISTS added_by_user_id INT REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE orgs
    ADD COLUMN IF NOT EXISTS validated_via TEXT;

ALTER TABLE orgs
    ADD COLUMN IF NOT EXISTS ein TEXT;

COMMENT ON COLUMN orgs.validated_via IS 'propublica, admin, or null.';
COMMENT ON COLUMN orgs.ein IS 'IRS EIN from ProPublica when validated_via = propublica.';
