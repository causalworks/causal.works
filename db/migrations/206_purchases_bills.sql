-- 206: Purchases/Sales V1, Section 3 (Bills/AP) -- with the four review fixes baked in from
-- the start, not retrofitted:
--
--   Fix 1 (double-gate)      -- handled in ledgerPosting.js (postLedgerTransaction's
--                                internalApproval bypass, migration 203's source_ref_id/type).
--                                Nothing in this migration needed for it.
--   Fix 2 (cross-org guard)  -- org_enforce_bill_lines_same_org(), own trigger instance on
--                                org_bill_lines, raising the same CA004 code
--                                org_enforce_ledger_lines_same_org() uses (same error class,
--                                not a shared binding -- FKs alone don't stop a bill line from
--                                referencing another org's account/program/grant row).
--   Fix 3 (fiscal-year lock) -- org_bills reuses the generic org_enforce_fiscal_year_lock()
--                                trigger directly (bare org_id/fiscal_year columns, same shape
--                                as org_ledger_transactions). org_bill_lines gets its own
--                                bespoke version deriving fiscal_year via join to the parent
--                                bill, mirroring org_enforce_fiscal_year_lock_ledger_lines() --
--                                the child-row lock org_ledger_lines already required and this
--                                schema was initially missing.
--   Fix 4 (new SQLSTATE)     -- org_enforce_bill_approval_separation_of_duties() raises CA008
--                                (next free code after CA001-CA007), not CA005 -- CA005 is
--                                caught in ledgerPosting.js's translateLedgerWriteError with
--                                ledger-transaction-flavored error text; reusing it here would
--                                either misroute through that handler or force it to
--                                special-case which table raised it. Bills gets its own
--                                translator (server/organizational/routes/bills.js).

CREATE TABLE org_bills (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id),
  bill_date date NOT NULL,
  due_date date,
  reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'scheduled', 'paid', 'void')),
  approved_by integer,
  approved_at timestamp with time zone,
  procurement_rationale text,
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_bills_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bills FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bills_org_isolation ON org_bills
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

CREATE TABLE org_bill_lines (
  id serial PRIMARY KEY,
  bill_id integer NOT NULL REFERENCES org_bills(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES org_accounts(id),
  program_id integer NOT NULL REFERENCES org_programs(id),
  grant_id integer REFERENCES org_grants(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  is_1099_reportable boolean,
  line_memo text
);

-- org_bill_lines has no org_id of its own (like org_ledger_lines) -- RLS is enforced via the
-- parent bill's org scoping through the FK relationship plus the same-org trigger below; direct
-- row access still requires knowing a bill_id that itself only resolves under the right
-- app.current_org_id, same trust boundary org_ledger_lines already relies on.
ALTER TABLE org_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bill_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bill_lines_org_isolation ON org_bill_lines
  USING (EXISTS (SELECT 1 FROM org_bills b WHERE b.id = bill_id AND b.org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE INDEX idx_org_bill_lines_bill ON org_bill_lines (bill_id);
CREATE INDEX idx_org_bills_org_status ON org_bills (org_id, status);
CREATE INDEX idx_org_bills_constituent ON org_bills (constituent_id);

-- Vendor must actually be a vendor.
CREATE FUNCTION org_enforce_bill_constituent_is_vendor() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_vendor IS TRUE) THEN
    RAISE EXCEPTION 'org_bills.constituent_id % must reference an org_constituents row with is_vendor = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bills_constituent_is_vendor BEFORE INSERT OR UPDATE OF constituent_id ON org_bills
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_constituent_is_vendor();

-- Posting-account check -- own instance, same CA003 error class as org_ledger_lines'.
CREATE FUNCTION org_enforce_posting_account_bill_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_bill_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bill_lines_posting_account BEFORE INSERT OR UPDATE OF account_id ON org_bill_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_bill_lines();

-- Fix 2: cross-org guard, own trigger instance, same CA004 error class.
CREATE FUNCTION org_enforce_bill_lines_same_org() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_bills WHERE id = NEW.bill_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NEW.grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_grants g WHERE g.id = NEW.grant_id AND g.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_bill_lines.grant_id % does not belong to org %', NEW.grant_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bill_lines_same_org BEFORE INSERT OR UPDATE ON org_bill_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_lines_same_org();

-- Fix 3: fiscal-year lock. org_bills has a bare org_id/fiscal_year pair, same shape as
-- org_ledger_transactions -- reuses the existing generic trigger function directly.
CREATE TRIGGER trg_fy_lock_bills BEFORE INSERT OR DELETE OR UPDATE ON org_bills
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();

-- org_bill_lines has no fiscal_year column of its own -- bespoke version deriving it via join
-- to the parent bill, mirroring org_enforce_fiscal_year_lock_ledger_lines() exactly.
CREATE FUNCTION org_enforce_fiscal_year_lock_bill_lines() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_bill_id integer;
BEGIN
  v_bill_id := COALESCE(NEW.bill_id, OLD.bill_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy FROM org_bills WHERE id = v_bill_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_fy_lock_bill_lines BEFORE INSERT OR DELETE OR UPDATE ON org_bill_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_bill_lines();

-- Fix 4: separation of duties, own trigger + own SQLSTATE (CA008, not a reuse of CA005).
CREATE FUNCTION org_enforce_bill_approval_separation_of_duties() RETURNS trigger AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'org_bills % cannot be approved by the same user who created it (created_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA008';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bills_approval_separation_of_duties BEFORE UPDATE OF approved_by ON org_bills
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bill_approval_separation_of_duties();
