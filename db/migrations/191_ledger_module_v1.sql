-- 191: Ledger module V1 -- schema only (org_ledger_transactions, org_ledger_lines), plus the
-- shared org_restriction_class enum, org_grants additions, and the org_settings actuals_source
-- flag. No application code wired to any of this yet -- every existing Xero/budget/compliance
-- read and write path is untouched. See Ledger_Module_V1_Spec.md.
--
-- Deviations from the spec worth flagging explicitly (see build notes back to the requester):
--   - FK columns on org_ledger_lines are bare `account_id`/`program_id`/`grant_id`, not
--     `org_account_id`/`org_program_id`/`org_grant_id` as the spec proposed. The spec's stated
--     goal was avoiding the org_actuals-style coop_*_id legacy naming -- but org_budget_lines
--     and org_schedule_items (the newest, most actively-maintained tables with this same
--     dimension set) already established bare account_id/program_id/grant_id as the live
--     convention. Matching that beats introducing a third naming scheme.
--   - `fiscal_year` is a plain NOT NULL integer on org_ledger_transactions (app-computed at
--     insert time via fiscalYear.js, identical to org_budget_lines/org_schedule_items), not a
--     FK to a "fiscal_year_id" dimension table -- no such table exists anywhere in this schema;
--     org_fiscal_year_locks itself keys on a plain integer. This lets the transactions table
--     reuse the existing generic org_enforce_fiscal_year_lock() trigger function directly,
--     exactly like org_budget_lines, instead of needing a new derived variant.
--   - Two DB-level invariants beyond what the spec's table literally lists, both following the
--     codebase's existing "Layer 1: schema constraints, can't be violated by buggy app code"
--     pattern (docs/financial-integrity-monitoring.md): (1) each line has exactly one non-zero
--     side (a CHECK), and (2) every transaction's lines must balance to zero, enforced via a
--     deferred constraint trigger so multi-line inserts within one DB transaction don't fail
--     until commit. A double-entry ledger that only enforces balance in app code is exactly the
--     kind of gap this codebase already argues against everywhere else.

-- ---------------------------------------------------------------------------
-- 1. Shared org_restriction_class enum -- new type, migrating the balance-sheet column onto it
--    (was a plain text column with a table-local CHECK; see the schema review).
-- ---------------------------------------------------------------------------

CREATE TYPE org_restriction_class AS ENUM (
  'unrestricted',
  'temporarily_restricted',
  'permanently_restricted'
);

-- Drop the old CHECK before the type change -- Postgres re-validates existing CHECK
-- constraints against the new column type mid-ALTER, and the old text[]-comparison CHECK
-- doesn't have an operator for the new enum type (caught live on first apply of this migration).
ALTER TABLE org_balance_sheet_snapshots
  DROP CONSTRAINT IF EXISTS org_balance_sheet_snapshots_restriction_class_check;

ALTER TABLE org_balance_sheet_snapshots
  ALTER COLUMN restriction_class TYPE org_restriction_class
  USING (restriction_class::org_restriction_class);

-- ---------------------------------------------------------------------------
-- 2. org_grants additions
-- ---------------------------------------------------------------------------

ALTER TABLE org_grants
  ADD COLUMN donor_restriction_class org_restriction_class,
  ADD COLUMN is_federal_award boolean DEFAULT false NOT NULL;

COMMENT ON COLUMN org_grants.donor_restriction_class IS
  'Net-asset classification for this grant, distinct from the freeform restrictions text column (grant condition notes).';
COMMENT ON COLUMN org_grants.is_federal_award IS
  'Per-grant flag, distinct from org_settings.federal_grant_recipient (org-level 990/compliance flag). Drives the real-time approval gate in Ledger V1 Section 5.';

-- ---------------------------------------------------------------------------
-- 3. org_settings: actuals_source flag
-- ---------------------------------------------------------------------------

ALTER TABLE org_settings
  ADD COLUMN actuals_source text DEFAULT 'xero' NOT NULL,
  ADD CONSTRAINT org_settings_actuals_source_check
    CHECK (actuals_source = ANY (ARRAY['xero'::text, 'ledger'::text]));

COMMENT ON COLUMN org_settings.actuals_source IS
  'Which writer is authoritative for this org''s org_actuals rows. Reporting never blends both for the same org/period; only the matching writer may post org_actuals rows for that org.';

-- ---------------------------------------------------------------------------
-- 4. org_ledger_transactions
-- ---------------------------------------------------------------------------

CREATE TABLE org_ledger_transactions (
  id SERIAL PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  transaction_date date NOT NULL,
  fiscal_year integer NOT NULL,
  memo text,
  payee text,
  reference_number text,
  status text NOT NULL DEFAULT 'posted',
  voided_at timestamp with time zone,
  voided_by integer REFERENCES users(id) ON DELETE SET NULL,
  void_reason text,
  reverses_transaction_id integer REFERENCES org_ledger_transactions(id),
  source text NOT NULL DEFAULT 'manual',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_ledger_transactions_status_check
    CHECK (status = ANY (ARRAY['posted'::text, 'voided'::text])),
  CONSTRAINT org_ledger_transactions_voided_consistency
    CHECK ((status = 'voided') = (voided_at IS NOT NULL)),
  CONSTRAINT org_ledger_transactions_source_check
    CHECK (source = ANY (ARRAY['manual'::text])),
  CONSTRAINT org_ledger_transactions_fy_reasonable
    CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200),
  CONSTRAINT org_ledger_transactions_no_self_reverse
    CHECK (reverses_transaction_id IS DISTINCT FROM id)
);

CREATE INDEX idx_org_ledger_transactions_org_fy ON org_ledger_transactions (org_id, fiscal_year);
CREATE INDEX idx_org_ledger_transactions_date ON org_ledger_transactions (org_id, transaction_date);

ALTER TABLE org_ledger_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ledger_transactions FORCE ROW LEVEL SECURITY;
CREATE POLICY org_ledger_transactions_org_isolation ON org_ledger_transactions
  USING ((org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));

-- ---------------------------------------------------------------------------
-- 5. org_ledger_lines
-- ---------------------------------------------------------------------------

CREATE TABLE org_ledger_lines (
  id SERIAL PRIMARY KEY,
  transaction_id integer NOT NULL REFERENCES org_ledger_transactions(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES org_accounts(id),
  program_id integer NOT NULL REFERENCES org_programs(id),
  grant_id integer REFERENCES org_grants(id),
  donor_restriction_class org_restriction_class,
  debit_cents bigint NOT NULL DEFAULT 0,
  credit_cents bigint NOT NULL DEFAULT 0,
  line_memo text,
  CONSTRAINT org_ledger_lines_amounts_non_negative
    CHECK (debit_cents >= 0 AND credit_cents >= 0),
  CONSTRAINT org_ledger_lines_exactly_one_side
    CHECK ((debit_cents > 0) <> (credit_cents > 0))
);

CREATE INDEX idx_org_ledger_lines_transaction ON org_ledger_lines (transaction_id);
CREATE INDEX idx_org_ledger_lines_account ON org_ledger_lines (account_id);
CREATE INDEX idx_org_ledger_lines_program ON org_ledger_lines (program_id);
CREATE INDEX idx_org_ledger_lines_grant ON org_ledger_lines (grant_id) WHERE grant_id IS NOT NULL;

-- org_ledger_lines has no org_id of its own (child of org_ledger_transactions, same shape as
-- org_allocation_lines/org_allocation_monthly under org_allocation_schedules) -- RLS still
-- applies, scoped via a join back to the parent transaction's org_id.
ALTER TABLE org_ledger_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ledger_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_ledger_lines_org_isolation ON org_ledger_lines
  USING (
    EXISTS (
      SELECT 1 FROM org_ledger_transactions t
      WHERE t.id = org_ledger_lines.transaction_id
        AND t.org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Posting-account enforcement -- same invariant and same trigger idiom already applied to
--    org_actuals/org_budget_lines (org_enforce_posting_account_actuals/_budget_lines).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_enforce_posting_account_ledger_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_ledger_lines_posting_account
  BEFORE INSERT OR UPDATE OF account_id ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_ledger_lines();

-- ---------------------------------------------------------------------------
-- 7. Transaction balance enforcement -- deferred so a multi-line INSERT within one DB
--    transaction doesn't fail until commit, once every line has been written.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_enforce_ledger_transaction_balance() RETURNS trigger AS $$
DECLARE
  v_transaction_id integer;
  v_diff bigint;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT COALESCE(SUM(debit_cents), 0) - COALESCE(SUM(credit_cents), 0) INTO v_diff
    FROM org_ledger_lines WHERE transaction_id = v_transaction_id;
  IF v_diff <> 0 THEN
    RAISE EXCEPTION 'org_ledger_transactions % does not balance (debit minus credit = % cents)', v_transaction_id, v_diff
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_org_ledger_lines_balance
  AFTER INSERT OR UPDATE OR DELETE ON org_ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_transaction_balance();

-- ---------------------------------------------------------------------------
-- 8. Fiscal-year lock wiring -- reusing org_fiscal_year_locks exactly as-is, no new locking
--    mechanism. org_ledger_transactions has its own org_id + fiscal_year, same shape as
--    org_budget_lines, so it reuses the existing generic function directly. org_ledger_lines
--    is a child table (no org_id/fiscal_year of its own), same shape as org_allocation_lines,
--    so it gets an analogous indirect variant keyed off transaction_id.
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_fy_lock_ledger_transactions
  BEFORE INSERT OR UPDATE OR DELETE ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();

CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock_ledger_lines() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_transaction_id integer;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy
    FROM org_ledger_transactions WHERE id = v_transaction_id;
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

CREATE TRIGGER trg_fy_lock_ledger_lines
  BEFORE INSERT OR UPDATE OR DELETE ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_ledger_lines();

-- Note: voiding/reversing a transaction in a since-locked period is still blocked by the
-- trigger above, same as every other locked table -- a correction to a locked period must go
-- through reopen-with-reason (org_fiscal_year_locks.reopen_reason), not a void bypass. This
-- matches the spec's "no hard delete, no permanent state" intent without adding a second,
-- competing lock-bypass path.
