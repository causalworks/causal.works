-- 219: Bills/Invoices have never had a way to record an actual payment -- 'scheduled'/'paid'
-- (bills) and 'partially_paid'/'paid' (invoices) are status values the CHECK constraints have
-- allowed since migrations 206/211, but nothing ever wrote them and no clearing entry (debit
-- liability, credit cash, or the reverse) ever posted. Caught live by a user who noticed it
-- wasn't in the UI; confirmed by reading bills.js/invoices.js directly. This closes the gap.
--
-- Deliberately asymmetric, matching what the existing status CHECKs already signal: bills have
-- no 'partially_paid' state, so a bill payment is always the full remaining balance in one shot.
-- Invoices already anticipate partial payment via 'partially_paid' -- org_invoice_payments can
-- carry more than one row per invoice, org_bill_payments realistically only ever one (plus a
-- void/re-pay pair if corrected).

CREATE TABLE org_bill_payments (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  bill_id integer NOT NULL REFERENCES org_bills(id),
  bank_account_id integer NOT NULL REFERENCES org_accounts(id),
  payment_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reference text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_bill_payments_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bill_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bill_payments_org_isolation ON org_bill_payments
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE TABLE org_invoice_payments (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  invoice_id integer NOT NULL REFERENCES org_invoices(id),
  bank_account_id integer NOT NULL REFERENCES org_accounts(id),
  payment_date date NOT NULL,
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  reference text,
  status text NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'void')),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_invoice_payments_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invoice_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY org_invoice_payments_org_isolation ON org_invoice_payments
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE INDEX idx_org_bill_payments_org_bill ON org_bill_payments (org_id, bill_id);
CREATE INDEX idx_org_invoice_payments_org_invoice ON org_invoice_payments (org_id, invoice_id);

-- Cross-org guards: bill_id/invoice_id and bank_account_id are all global-id FKs that could
-- otherwise reference a different org's row. Numbered _1_ so it fires before the cash-account
-- check, same lesson as migration 210/213.
CREATE FUNCTION org_enforce_bill_payments_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = NEW.bill_id AND b.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_payments.bill_id % does not belong to org %', NEW.bill_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_bill_payments.bank_account_id % does not belong to org %', NEW.bank_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_bill_payments_1_same_org BEFORE INSERT OR UPDATE ON org_bill_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_payments_same_org();

CREATE FUNCTION org_enforce_invoice_payments_same_org() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = NEW.invoice_id AND i.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_payments.invoice_id % does not belong to org %', NEW.invoice_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id) THEN
    RAISE EXCEPTION 'org_invoice_payments.bank_account_id % does not belong to org %', NEW.bank_account_id, NEW.org_id USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_payments_1_same_org BEFORE INSERT OR UPDATE ON org_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_payments_same_org();

-- Cash-account check: bank_account_id must be a real is_cash_account, not just any posting
-- account -- distinct from the generic posting-account (CA003) check used elsewhere, since the
-- constraint here is specifically "a cash/bank account", a stricter subset.
CREATE FUNCTION org_enforce_bill_payments_cash_account() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_payments.bank_account_id % must reference a cash account (is_cash_account = true)', NEW.bank_account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_bill_payments_2_cash_account BEFORE INSERT OR UPDATE OF bank_account_id ON org_bill_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_payments_cash_account();

CREATE FUNCTION org_enforce_invoice_payments_cash_account() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.bank_account_id AND a.is_cash_account IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_payments.bank_account_id % must reference a cash account (is_cash_account = true)', NEW.bank_account_id USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trg_invoice_payments_2_cash_account BEFORE INSERT OR UPDATE OF bank_account_id ON org_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_payments_cash_account();

-- Fiscal-year lock: both tables carry a bare org_id/fiscal_year pair, reuse the generic trigger.
CREATE TRIGGER trg_fy_lock_bill_payments BEFORE INSERT OR DELETE OR UPDATE ON org_bill_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_invoice_payments BEFORE INSERT OR DELETE OR UPDATE ON org_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();

-- New ledger transaction sources for the clearing entries these payments post.
ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text]));
