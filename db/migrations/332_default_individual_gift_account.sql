-- Income account that Receive pre-selects for gifts from individual contacts.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_individual_gift_account_id integer REFERENCES org_accounts(id) ON DELETE SET NULL;
