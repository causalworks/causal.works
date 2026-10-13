-- 327: contacts can hold more than one email address.
ALTER TABLE org_constituents ADD COLUMN IF NOT EXISTS additional_emails text[];
