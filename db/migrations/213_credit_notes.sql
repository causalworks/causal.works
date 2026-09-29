-- 213: Purchases/Sales V1, Section 3.6/4.7 (credit notes, both sides). Same shape as Bills and
-- Invoices before it -- a credit note is a document; applying it is what touches the ledger, a
-- separate action from creating the row. Every same-org/posting-account/fiscal-year-lock
-- discipline from the Bills/Invoices migrations applies here too, no exceptions for being a
-- "smaller" table.
--
-- Unlike Bills/Invoices, a credit note isn't a multi-line document (spec: "a credit doesn't
-- always tie to one specific bill") -- one amount, one account to reverse against, tied
-- optionally to an original bill/invoice. account_id is required explicitly (not derived from
-- a possibly-multi-line original bill) -- same reasoning as write-off's bad_debt_expense_account_id:
-- which account to reverse against is a real choice, not something to infer.

CREATE TABLE org_bill_credit_notes (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id),
  original_bill_id integer REFERENCES org_bills(id),
  account_id integer NOT NULL REFERENCES org_accounts(id),
  program_id integer NOT NULL REFERENCES org_programs(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'void')),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_bill_credit_notes_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_bill_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bill_credit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bill_credit_notes_org_isolation ON org_bill_credit_notes
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE TABLE org_invoice_credit_notes (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id),
  original_invoice_id integer REFERENCES org_invoices(id),
  account_id integer NOT NULL REFERENCES org_accounts(id),
  program_id integer NOT NULL REFERENCES org_programs(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reason text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'void')),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_invoice_credit_notes_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_invoice_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invoice_credit_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY org_invoice_credit_notes_org_isolation ON org_invoice_credit_notes
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE INDEX idx_org_bill_credit_notes_org_status ON org_bill_credit_notes (org_id, status);
CREATE INDEX idx_org_invoice_credit_notes_org_status ON org_invoice_credit_notes (org_id, status);

-- Vendor/customer role guard, same as Bills/Invoices.
CREATE FUNCTION org_enforce_bill_credit_note_constituent_is_vendor() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_vendor IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.constituent_id % must reference an org_constituents row with is_vendor = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_bill_credit_notes_1_constituent_is_vendor BEFORE INSERT OR UPDATE OF constituent_id ON org_bill_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_credit_note_constituent_is_vendor();

CREATE FUNCTION org_enforce_invoice_credit_note_constituent_is_customer() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_customer IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.constituent_id % must reference an org_constituents row with is_customer = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_credit_notes_1_constituent_is_customer BEFORE INSERT OR UPDATE OF constituent_id ON org_invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_credit_note_constituent_is_customer();

-- Cross-org guard: account_id, program_id, original_bill_id/original_invoice_id are all global-id
-- FKs that could otherwise reference a different org's row. Numbered _1_ so it fires before any
-- posting-account check, same lesson as migration 210.
CREATE FUNCTION org_enforce_bill_credit_notes_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.account_id % does not belong to org %', NEW.account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.program_id % does not belong to org %', NEW.program_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NEW.original_bill_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = NEW.original_bill_id AND b.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.original_bill_id % does not belong to org %', NEW.original_bill_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_bill_credit_notes_2_same_org BEFORE INSERT OR UPDATE ON org_bill_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_credit_notes_same_org();

CREATE FUNCTION org_enforce_invoice_credit_notes_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.account_id % does not belong to org %', NEW.account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.program_id % does not belong to org %', NEW.program_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NEW.original_invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = NEW.original_invoice_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.original_invoice_id % does not belong to org %', NEW.original_invoice_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_credit_notes_2_same_org BEFORE INSERT OR UPDATE ON org_invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_credit_notes_same_org();

-- Posting-account check, own instance, same CA003 error class, numbered to fire after same-org.
CREATE FUNCTION org_enforce_posting_account_bill_credit_notes() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_credit_notes.account_id % must reference a posting org_accounts row', NEW.account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_bill_credit_notes_3_posting_account BEFORE INSERT OR UPDATE OF account_id ON org_bill_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_bill_credit_notes();

CREATE FUNCTION org_enforce_posting_account_invoice_credit_notes() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_credit_notes.account_id % must reference a posting org_accounts row', NEW.account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_credit_notes_3_posting_account BEFORE INSERT OR UPDATE OF account_id ON org_invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_invoice_credit_notes();

-- Fiscal-year lock: both tables carry a bare org_id/fiscal_year pair, reuse the generic trigger.
CREATE TRIGGER trg_fy_lock_bill_credit_notes BEFORE INSERT OR DELETE OR UPDATE ON org_bill_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_invoice_credit_notes BEFORE INSERT OR DELETE OR UPDATE ON org_invoice_credit_notes
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
