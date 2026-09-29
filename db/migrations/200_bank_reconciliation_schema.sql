-- 200: Bank Reconciliation V1, Step 1 -- schema only (org_bank_statement_lines, the
-- is_system_clearing_account flag + lazy per-org creation function, org_import_history's new
-- 'bank_statement' kind). See Bank_Reconciliation_V1_Spec.md. Named "Bank Reconciliation"
-- throughout, deliberately never "Reconciliation Summary" -- server/organizational/lib/
-- reconciliation.js already implements a live, differently-scoped feature ("Reconciliation &
-- Close": balance-sheet ties, grant-allocation-vs-award, tied to fiscal-year-lock), and reusing
-- that name for a different concept would make the two impossible to tell apart in the UI.

-- ---------------------------------------------------------------------------
-- 1. org_accounts: the clearing-account flag. Looked up by flag, never by a hardcoded code --
--    there is no platform-wide accounts table (org_accounts rows are always created per-org,
--    via template/Xero-sync/CSV), so no code can be assumed free across every org's actual
--    chart. At most one clearing account per org.
-- ---------------------------------------------------------------------------

ALTER TABLE org_accounts ADD COLUMN is_system_clearing_account boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX idx_org_accounts_one_clearing_account_per_org
  ON org_accounts (org_id) WHERE is_system_clearing_account = true;

COMMENT ON COLUMN org_accounts.is_system_clearing_account IS
  'True for the org''s internal-bank-transfer clearing account (Bank Reconciliation V1). Looked up via this flag, never a hardcoded account code -- see org_get_or_create_clearing_account().';

-- Lazy, collision-checked creation: reuses an existing clearing account if one already exists
-- for this org; otherwise finds the first free code in a small reserved block starting at 1090
-- (not assumed free -- checked against this org's actual chart) and creates one there.
CREATE OR REPLACE FUNCTION org_get_or_create_clearing_account(p_org_id integer) RETURNS integer AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_clearing_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (1090 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s transfer clearing account (checked 1090-1110)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_clearing_account)
  VALUES (p_org_id, v_candidate_code, 'Internal Bank Transfer Clearing', 'asset', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- 2. org_import_history: add the new import kind so bank-statement imports show up wherever
--    import history is already surfaced, same as every other import type.
-- ---------------------------------------------------------------------------

ALTER TABLE org_import_history DROP CONSTRAINT org_import_history_import_kind_check;
ALTER TABLE org_import_history ADD CONSTRAINT org_import_history_import_kind_check
  CHECK (import_kind = ANY (ARRAY['coa'::text, 'programs'::text, 'grants'::text, 'budget_lines'::text,
                                   'actuals'::text, 'balance_sheet'::text, 'bank_statement'::text]));

-- ---------------------------------------------------------------------------
-- 3. org_bank_statement_lines
-- ---------------------------------------------------------------------------

CREATE TABLE org_bank_statement_lines (
  id SERIAL PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  bank_account_id integer NOT NULL REFERENCES org_accounts(id),
  statement_date date NOT NULL,
  amount_cents bigint NOT NULL,
  payee_raw text,
  description_raw text,
  import_fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'unconfirmed',
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  is_internal_transfer boolean DEFAULT false NOT NULL,
  transfer_pair_line_id integer REFERENCES org_bank_statement_lines(id),
  discuss_note text,
  discuss_resolved_at timestamp with time zone,
  coding_source text NOT NULL DEFAULT 'manual',
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_bank_statement_lines_status_check
    CHECK (status = ANY (ARRAY['unconfirmed'::text, 'confirmed'::text, 'transfer_pending'::text])),
  CONSTRAINT org_bank_statement_lines_coding_source_check
    CHECK (coding_source = ANY (ARRAY['manual'::text, 'rule'::text])),
  CONSTRAINT org_bank_statement_lines_no_self_pair
    CHECK (transfer_pair_line_id IS DISTINCT FROM id),
  CONSTRAINT org_bank_statement_lines_org_fingerprint_unique
    UNIQUE (org_id, import_fingerprint)
);

CREATE INDEX idx_org_bank_statement_lines_org_account ON org_bank_statement_lines (org_id, bank_account_id);
CREATE INDEX idx_org_bank_statement_lines_org_status ON org_bank_statement_lines (org_id, status);
CREATE INDEX idx_org_bank_statement_lines_org_date ON org_bank_statement_lines (org_id, statement_date);

ALTER TABLE org_bank_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bank_statement_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bank_statement_lines_org_isolation ON org_bank_statement_lines
  USING ((org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));

-- ---------------------------------------------------------------------------
-- 4. bank_account_id must be a cash account belonging to the same org. Both checks in one
--    function/query -- org_id is a direct column on this table (not looked up via a join the
--    way org_ledger_lines has to look up its parent transaction's org_id), so the query below
--    filters by NEW.org_id directly and RLS (scoped to the same GUC in normal operation) stays
--    consistent with it -- this is the exact shape migration 198 established as safe, not the
--    shape that had the visibility bug.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_enforce_bank_statement_line_account() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a
    WHERE a.id = NEW.bank_account_id AND a.org_id = NEW.org_id AND a.is_cash_account IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_bank_statement_lines.bank_account_id % must be a cash account belonging to org %', NEW.bank_account_id, NEW.org_id
      USING ERRCODE = 'CA007';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bank_statement_lines_account
  BEFORE INSERT OR UPDATE OF bank_account_id, org_id ON org_bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bank_statement_line_account();

-- transfer_pair_line_id must point at a line in the same org -- same shape/reasoning as above.
CREATE OR REPLACE FUNCTION org_enforce_bank_statement_transfer_pair_same_org() RETURNS trigger AS $$
BEGIN
  IF NEW.transfer_pair_line_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM org_bank_statement_lines p
       WHERE p.id = NEW.transfer_pair_line_id AND p.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'org_bank_statement_lines.transfer_pair_line_id % does not belong to org %', NEW.transfer_pair_line_id, NEW.org_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bank_statement_lines_transfer_pair_same_org
  BEFORE INSERT OR UPDATE OF transfer_pair_line_id, org_id ON org_bank_statement_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_bank_statement_transfer_pair_same_org();
