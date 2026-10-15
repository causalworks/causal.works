-- Organization details printed on invoices, bills, receipts and reports.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS legal_name text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS mailing_address text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS contact_email text;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS payment_instructions text;
