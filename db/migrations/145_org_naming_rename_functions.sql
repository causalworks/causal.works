-- 145: Follow-up to 144 -- Postgres functions/triggers with `coop_` in their
-- own name and, for two of them, hardcoded `coop_accounts` references baked
-- into the PL/pgSQL function BODY as text. Table renames don't touch this:
-- a trigger/policy/view depends on a table by OID and follows a rename
-- automatically, but a function body is just stored text -- ALTER TABLE
-- RENAME has no way to know a string inside a function body refers to that
-- table. Found via a live failure: inserting an insurance schedule item
-- after migration 144 threw `relation "coop_accounts" does not exist` from
-- inside coop_enforce_posting_account_budget_lines(), the trigger that
-- validates account_id/coop_account_id reference a posting account.

BEGIN;

ALTER FUNCTION coop_enforce_posting_account_actuals()      RENAME TO org_enforce_posting_account_actuals;
ALTER FUNCTION coop_enforce_posting_account_budget_lines() RENAME TO org_enforce_posting_account_budget_lines;
ALTER FUNCTION update_coop_constituents_updated_at()        RENAME TO update_org_constituents_updated_at;
ALTER FUNCTION update_coop_gifts_updated_at()                RENAME TO update_org_gifts_updated_at;

CREATE OR REPLACE FUNCTION org_enforce_posting_account_actuals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.coop_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.coop_account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_actuals.coop_account_id % must reference a posting org_accounts row', NEW.coop_account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION org_enforce_posting_account_budget_lines()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_budget_lines.account_id % must reference a posting org_accounts row', NEW.account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

-- Trigger names, cosmetic only (no embedded SQL), renamed for consistency.
ALTER TRIGGER trg_coop_actuals_posting_account      ON org_actuals            RENAME TO trg_org_actuals_posting_account;
ALTER TRIGGER trg_coop_budget_lines_posting_account ON org_budget_lines       RENAME TO trg_org_budget_lines_posting_account;
ALTER TRIGGER trigger_coop_constituents_updated_at  ON org_constituents       RENAME TO trigger_org_constituents_updated_at;
ALTER TRIGGER trigger_coop_gifts_updated_at         ON org_gifts              RENAME TO trigger_org_gifts_updated_at;

COMMIT;
