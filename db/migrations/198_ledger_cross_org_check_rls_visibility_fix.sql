-- 198: Caught during Phase 4 verification via a REAL HTTP request against the running server
-- (causal_app role, RLS active) -- something the earlier Phase 2b SQL testing, run as the
-- postgres superuser, could not have caught, because superusers bypass RLS entirely.
--
-- Bug: org_enforce_ledger_lines_same_org() (migrations 196/197) queries org_accounts under
-- RLS. Under a real request, app.current_org_id is set to the CALLER's real org -- so a line
-- pointing at another org's account makes that account row invisible to the check's own SELECT
-- (RLS hides it), not just "wrong org". Meanwhile trg_org_ledger_lines_posting_account fires
-- first alphabetically and does its own RLS-scoped SELECT against org_accounts, which ALSO
-- can't see the foreign row -- so THAT check fails first and reports "must reference a posting
-- account", not "belongs to a different org". The write is still correctly rejected either way
-- (no security bug), but the error code returned to the API layer was wrong, which matters
-- given this phase's whole point was distinguishing the four cases correctly.
--
-- Fix, two parts:
--   1. org_enforce_ledger_lines_same_org() becomes SECURITY DEFINER (narrow, single-purpose --
--      matches the existing convention for resolve_member_org_id() etc.: bypass RLS only to
--      check the one fact this function exists to check, nothing else exposed).
--   2. Trigger execution order flips: the same-org check needs to run BEFORE the
--      posting-account check, so a cross-org reference is correctly identified as such before
--      the posting-account check ever gets a chance to (mis)report on an account it can't see.
--      Postgres fires same-table/same-event triggers in alphabetical order by name -- renamed
--      both triggers with explicit ordering prefixes to make this a real guarantee, not an
--      accident of naming.
--
-- org_enforce_ledger_reversal_same_org() does NOT have this bug: it checks org_ledger_transactions
-- WHERE org_id = NEW.org_id, and RLS is already scoped to that same org_id (the GUC), so the two
-- filters agree rather than conflict -- no visibility mismatch there.

CREATE OR REPLACE FUNCTION org_enforce_ledger_lines_same_org() RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
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
$$;

DROP TRIGGER IF EXISTS trg_org_ledger_lines_same_org ON org_ledger_lines;
DROP TRIGGER IF EXISTS trg_org_ledger_lines_posting_account ON org_ledger_lines;

CREATE TRIGGER trg_ledger_lines_1_same_org
  BEFORE INSERT OR UPDATE OF transaction_id, account_id, program_id, grant_id ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_lines_same_org();

CREATE TRIGGER trg_ledger_lines_2_posting_account
  BEFORE INSERT OR UPDATE OF account_id ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_ledger_lines();
