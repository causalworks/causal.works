-- 211: Purchases/Sales V1, Section 4 (Sales/AR). Mirrors Bills' structure and every fix applied
-- there, applied correctly from the start this time rather than discovered by verification:
--   - trigger names carry the same numbered convention (trg_invoice_lines_1_same_org before
--     _2_posting_account) so the cross-org check can't be masked by the posting-account check's
--     own RLS-scoped lookup, the exact bug migration 210 had to fix after the fact for Bills.
--   - own CA004-class cross-org guard trigger instance on org_invoice_lines (not shared with
--     Bills' or Ledger's).
--   - fiscal-year lock: org_invoices reuses the generic trigger (bare org_id/fiscal_year, same
--     shape as org_bills); org_invoice_lines gets its own bespoke join-to-parent version.
--   - constituent role guard: invoice's constituent_id must reference is_customer = true,
--     mirroring Bills' is_vendor guard exactly.

CREATE TABLE org_invoices (
  id serial PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id integer NOT NULL REFERENCES org_constituents(id),
  invoice_date date NOT NULL,
  due_date date,
  reference text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'void', 'written_off')),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  membership_payment_id integer REFERENCES org_membership_payments(id),
  fiscal_year integer NOT NULL,
  created_by integer,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_invoices_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

ALTER TABLE org_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invoices FORCE ROW LEVEL SECURITY;
CREATE POLICY org_invoices_org_isolation ON org_invoices
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

COMMENT ON COLUMN org_invoices.membership_payment_id IS 'Optional hook so an invoice can reference an org_membership_payments row instead of duplicating it (spec 4.6) -- not populated by any route yet, reserved for the Membership-integration UI work.';

CREATE TABLE org_invoice_lines (
  id serial PRIMARY KEY,
  invoice_id integer NOT NULL REFERENCES org_invoices(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES org_accounts(id),
  program_id integer NOT NULL REFERENCES org_programs(id),
  description text,
  quantity numeric NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_cents bigint NOT NULL CHECK (unit_amount_cents > 0),
  fair_market_value_cents bigint CHECK (fair_market_value_cents IS NULL OR (fair_market_value_cents >= 0 AND fair_market_value_cents <= unit_amount_cents)),
  line_memo text
);

ALTER TABLE org_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_invoice_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_invoice_lines_org_isolation ON org_invoice_lines
  USING (EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = invoice_id AND i.org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer));

CREATE INDEX idx_org_invoice_lines_invoice ON org_invoice_lines (invoice_id);
CREATE INDEX idx_org_invoices_org_status ON org_invoices (org_id, status);
CREATE INDEX idx_org_invoices_constituent ON org_invoices (constituent_id);

COMMENT ON COLUMN org_invoice_lines.fair_market_value_cents IS 'Set only for quid-pro-quo lines (spec 4.3): the exchange/earned-revenue portion of unit_amount_cents. NULL means the whole line is a straight exchange sale, posted to account_id in full. When set, the remainder (unit_amount_cents - fair_market_value_cents) posts to the org''s contribution-revenue account instead -- two ledger lines from one invoice line.';

-- Customer must actually be a customer.
CREATE FUNCTION org_enforce_invoice_constituent_is_customer() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_constituents c WHERE c.id = NEW.constituent_id AND c.org_id = NEW.org_id AND c.is_customer IS TRUE) THEN
    RAISE EXCEPTION 'org_invoices.constituent_id % must reference an org_constituents row with is_customer = true, in the same org', NEW.constituent_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoices_constituent_is_customer BEFORE INSERT OR UPDATE OF constituent_id ON org_invoices
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_constituent_is_customer();

-- Cross-org guard -- own instance, numbered to fire before the posting-account check.
CREATE FUNCTION org_enforce_invoice_lines_same_org() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_invoices WHERE id = NEW.invoice_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_invoice_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_invoice_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_lines_1_same_org BEFORE INSERT OR UPDATE ON org_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_invoice_lines_same_org();

-- Posting-account check -- own instance, same CA003 error class, numbered to fire second.
CREATE FUNCTION org_enforce_posting_account_invoice_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE) THEN
    RAISE EXCEPTION 'org_invoice_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_lines_2_posting_account BEFORE INSERT OR UPDATE OF account_id ON org_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_invoice_lines();

-- Fiscal-year lock: org_invoices reuses the generic trigger directly.
CREATE TRIGGER trg_fy_lock_invoices BEFORE INSERT OR DELETE OR UPDATE ON org_invoices
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();

-- org_invoice_lines: bespoke version deriving fiscal_year via join to the parent invoice.
CREATE FUNCTION org_enforce_fiscal_year_lock_invoice_lines() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_invoice_id integer;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy FROM org_invoices WHERE id = v_invoice_id;
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

CREATE TRIGGER trg_fy_lock_invoice_lines BEFORE INSERT OR DELETE OR UPDATE ON org_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_invoice_lines();

-- Accounts Receivable, lazily created per org -- same pattern as org_get_or_create_ap_account
-- (migration 209) and org_get_or_create_clearing_account before that. A straight exchange sale
-- debits this on Sent; the quid-pro-quo split (spec 4.3) also needs somewhere to put the
-- contribution-revenue portion of a line, so this migration creates that lazy account too.
ALTER TABLE org_accounts ADD COLUMN is_system_ar_account boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_org_accounts_one_ar_account_per_org ON org_accounts (org_id) WHERE is_system_ar_account;
COMMENT ON COLUMN org_accounts.is_system_ar_account IS 'Marks the org''s single system-managed Accounts Receivable asset account, lazily created by org_get_or_create_ar_account on first Invoice send. Same pattern as is_system_ap_account/is_system_clearing_account.';

ALTER TABLE org_accounts ADD COLUMN is_system_contribution_revenue_account boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX idx_org_accounts_one_contrib_rev_account_per_org ON org_accounts (org_id) WHERE is_system_contribution_revenue_account;
COMMENT ON COLUMN org_accounts.is_system_contribution_revenue_account IS 'Marks the org''s single system-managed contribution-revenue income account, lazily created the first time a quid-pro-quo invoice line (spec 4.3) needs somewhere to post the non-exchange portion of a sale.';

CREATE FUNCTION org_get_or_create_ar_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts WHERE org_id = p_org_id AND is_system_ar_account = true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  LOOP
    v_candidate_code := (1200 + v_offset)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code);
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Accounts Receivable account (checked 1200-1220)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_ar_account)
  VALUES (p_org_id, v_candidate_code, 'Accounts Receivable', 'asset', 3, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE FUNCTION org_get_or_create_contribution_revenue_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts WHERE org_id = p_org_id AND is_system_contribution_revenue_account = true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  LOOP
    v_candidate_code := (4900 + v_offset)::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code);
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s contribution-revenue account (checked 4900-4920)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_contribution_revenue_account)
  VALUES (p_org_id, v_candidate_code, 'Contribution Revenue (Quid Pro Quo Split)', 'income', 3, true, true)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
