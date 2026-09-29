-- 197: Phase 4 (posting API) needs to distinguish four different rejection reasons in its HTTP
-- response -- unbalanced, non-posting account, cross-org reference, locked fiscal year -- the
-- same way migration 164 already does for fiscal-year locks via a custom SQLSTATE ('CA001') so
-- app code can match on e.code exactly instead of parsing the RAISE EXCEPTION message text
-- (fragile, and the existing isFiscalYearLockedError() helper is proof this codebase already
-- prefers the exact-code approach). Three of my four ledger triggers were sharing generic
-- '23514' (check_violation), indistinguishable from each other and from the two real declarative
-- CHECK constraints (exactly-one-side, non-negative) that also throw 23514 -- giving each RAISE
-- EXCEPTION its own custom code the same way 164 already did is the fix, not new logic.
--
-- Declarative CHECK constraint violations (org_ledger_lines_exactly_one_side,
-- _amounts_non_negative) are left as plain 23514 -- Postgres already reports the constraint name
-- on those (err.constraint), which is a reliable way to distinguish them without a custom code;
-- only the RAISE EXCEPTION-based checks needed this treatment.
--
--   CA002 -- transaction does not balance (org_enforce_ledger_transaction_balance)
--   CA003 -- line references a non-posting account (org_enforce_posting_account_ledger_lines)
--   CA004 -- line or reversal references a row belonging to a different org
--            (org_enforce_ledger_lines_same_org, org_enforce_ledger_reversal_same_org)

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
      USING ERRCODE = 'CA002';
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION org_enforce_posting_account_ledger_lines() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = 'CA003';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION org_enforce_ledger_lines_same_org() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_ledger_transactions WHERE id = NEW.transaction_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  IF NEW.grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_grants g WHERE g.id = NEW.grant_id AND g.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.grant_id % does not belong to org %', NEW.grant_id, v_org_id
      USING ERRCODE = 'CA004';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION org_enforce_ledger_reversal_same_org() RETURNS trigger AS $$
BEGIN
  IF NEW.reverses_transaction_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM org_ledger_transactions r
       WHERE r.id = NEW.reverses_transaction_id AND r.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'org_ledger_transactions.reverses_transaction_id % does not belong to org %', NEW.reverses_transaction_id, NEW.org_id
      USING ERRCODE = 'CA004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
