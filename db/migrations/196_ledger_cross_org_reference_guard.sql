-- 196: Closes the cross-org reference gap flagged at the end of Phase 2 -- a plain FK only
-- confirms the referenced row exists, not that it belongs to the same org as the row pointing
-- at it. Two places in the ledger table set have this gap:
--
--   - org_ledger_lines.account_id / program_id / grant_id can reference another org's
--     org_accounts / org_programs / org_grants row -- the FK is satisfied either way.
--   - org_ledger_transactions.reverses_transaction_id (self-referencing) can point at another
--     org's transaction -- same gap, one level up.
--
-- No other table in this set has it: org_ledger_transactions.org_id is the anchor itself (not a
-- reference needing a match check), and created_by/voided_by reference users(id), which isn't
-- org-scoped at all (a user can belong to multiple orgs; there's no "wrong org" for a user id).

CREATE OR REPLACE FUNCTION org_enforce_ledger_lines_same_org() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
BEGIN
  SELECT org_id INTO v_org_id FROM org_ledger_transactions WHERE id = NEW.transaction_id;

  IF NOT EXISTS (SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.account_id % does not belong to org %', NEW.account_id, v_org_id
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM org_programs p WHERE p.id = NEW.program_id AND p.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.program_id % does not belong to org %', NEW.program_id, v_org_id
      USING ERRCODE = '23514';
  END IF;

  IF NEW.grant_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM org_grants g WHERE g.id = NEW.grant_id AND g.org_id = v_org_id) THEN
    RAISE EXCEPTION 'org_ledger_lines.grant_id % does not belong to org %', NEW.grant_id, v_org_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_ledger_lines_same_org
  BEFORE INSERT OR UPDATE OF transaction_id, account_id, program_id, grant_id ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_lines_same_org();

CREATE OR REPLACE FUNCTION org_enforce_ledger_reversal_same_org() RETURNS trigger AS $$
BEGIN
  IF NEW.reverses_transaction_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM org_ledger_transactions r
       WHERE r.id = NEW.reverses_transaction_id AND r.org_id = NEW.org_id
     ) THEN
    RAISE EXCEPTION 'org_ledger_transactions.reverses_transaction_id % does not belong to org %', NEW.reverses_transaction_id, NEW.org_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_ledger_transactions_reversal_same_org
  BEFORE INSERT OR UPDATE OF reverses_transaction_id, org_id ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_reversal_same_org();
