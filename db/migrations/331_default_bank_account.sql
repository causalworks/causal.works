-- Bank account that new Receive, Spend and Transfer entries start on.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_bank_account_id integer REFERENCES org_accounts(id) ON DELETE SET NULL;
