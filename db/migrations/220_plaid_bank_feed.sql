-- 220: Plaid live bank feed. Adds the schema for a real, continuously-updating bank connection
-- alongside CSV import (both remain valid ways to get lines into org_bank_statement_lines) --
-- Bank_Reconciliation_V1_Spec.md explicitly deferred this to "V2"; built now per direct
-- instruction, since Plaid production access is already granted for this Plaid app (only the
-- OAuth-institution registration step remains pending) and CSV-only significantly understates
-- how real bookkeeping systems actually get most of their entries.

-- ---------------------------------------------------------------------------
-- 1. org_plaid_items -- one row per Plaid Link session (an Item can cover multiple accounts
--    at one institution). access_token stored as plain text behind RLS, same precedent as
--    org_settings.xero_token_data (jsonb, no field-level encryption) -- not a new security bar
--    invented here, a noted future hardening item.
-- ---------------------------------------------------------------------------

CREATE TABLE org_plaid_items (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  item_id text NOT NULL UNIQUE,
  access_token text NOT NULL,
  institution_id text,
  institution_name text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'error', 'revoked')),
  error_message text,
  cursor text,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE org_plaid_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plaid_items FORCE ROW LEVEL SECURITY;
CREATE POLICY org_plaid_items_org_isolation ON org_plaid_items
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

-- ---------------------------------------------------------------------------
-- 2. org_plaid_accounts -- maps one Plaid account_id to the org's own org_accounts row (the
--    same account a CSV import would target), so downstream code never needs to know whether
--    a given org_accounts row is Plaid-linked or CSV-only except by checking this table.
-- ---------------------------------------------------------------------------

CREATE TABLE org_plaid_accounts (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  plaid_item_id integer NOT NULL REFERENCES org_plaid_items(id) ON DELETE CASCADE,
  plaid_account_id text NOT NULL UNIQUE,
  org_account_id integer NOT NULL REFERENCES org_accounts(id),
  plaid_account_name text,
  plaid_account_mask text,
  current_balance_cents bigint,
  available_balance_cents bigint,
  last_synced_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE org_plaid_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_plaid_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY org_plaid_accounts_org_isolation ON org_plaid_accounts
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE UNIQUE INDEX idx_org_plaid_accounts_one_per_org_account ON org_plaid_accounts (org_account_id);

CREATE FUNCTION org_enforce_plaid_accounts_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_plaid_items i WHERE i.id = NEW.plaid_item_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_plaid_accounts.plaid_item_id % does not belong to org %', NEW.plaid_item_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.org_account_id AND a.org_id = NEW.org_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_plaid_accounts.org_account_id % must be a cash account belonging to org %', NEW.org_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_plaid_accounts_1_same_org BEFORE INSERT OR UPDATE ON org_plaid_accounts
  FOR EACH ROW EXECUTE FUNCTION org_enforce_plaid_accounts_same_org();

-- ---------------------------------------------------------------------------
-- 3. org_bank_statement_lines: source + Plaid identity + pending-transaction linkage.
--    Plaid's own documented model treats a pending->posted transition as a NEW transaction
--    (with pending_transaction_id pointing at the one it replaces), not a state change on the
--    same row -- plaid_pending_transaction_id lets the sync handler find and remove the old
--    pending row when the posted one arrives, mirroring that model exactly instead of trying
--    to update a row in place.
-- ---------------------------------------------------------------------------

ALTER TABLE org_bank_statement_lines
  ADD COLUMN source text NOT NULL DEFAULT 'csv' CHECK (source IN ('csv', 'plaid')),
  ADD COLUMN plaid_transaction_id text,
  ADD COLUMN plaid_pending_transaction_id text,
  ADD COLUMN pending boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_org_bank_statement_lines_plaid_txn ON org_bank_statement_lines (org_id, plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;

COMMENT ON COLUMN org_bank_statement_lines.pending IS 'Plaid pending transactions import as normal unconfirmed lines but are flagged pending so the UI can show them as provisional. A pending line is deleted outright (not updated) once Plaid reports the corresponding posted transaction, per Plaid''s own "new transaction, not a state change" model.';
