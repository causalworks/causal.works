-- 244: org_enforce_fiscal_year_lock() is shared by org_budget_lines, org_schedule_items,
-- org_personnel, and org_grant_allocations (migration 164) and fires unconditionally on any
-- row for a locked org+FY. It predates scenario_id (migration 241) and doesn't know three of
-- those four tables now carry scenario-forked rows -- as written, forking a detailed scenario
-- against a closed fiscal year would fail with CA001, directly contradicting the v1 design
-- decision (2026-09-14-scenario-budgeting-spec.md) that drafting a scenario against a closed
-- FY is legitimate forward planning, not a reopening of the books.
--
-- Fix: skip the lock check when the row being written is scenario-scoped. Uses to_jsonb probing
-- instead of a direct NEW.scenario_id reference because this same function also fires on
-- org_budget_lines, which deliberately has no scenario_id column (see v2 spec's blast-radius
-- rationale) -- a direct column reference would fail to compile for that table. The probe
-- returns NULL both when scenario_id genuinely is NULL (a live row) and when the column doesn't
-- exist at all (org_budget_lines) -- both cases correctly fall through to the existing lock
-- check; only an actual non-null scenario_id skips it.
--
-- (v_org_id reads NEW.org_id/OLD.org_id, matching this table set's actual current column name
-- -- migration 164's original body referenced coop_org_id, since superseded by a later
-- migration to org_id after the pers/coop rename; verified against the live function before
-- writing this, not assumed from the historical migration file.)
--
-- The lock still applies at the real point that matters: promotion. promoteScenarioInputs()
-- writes scenario_id = NULL live rows, which are not scenario-scoped, so they hit this same
-- check normally and correctly abort with CA001 if the target FY is locked.

CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_scenario_id text;
BEGIN
  v_scenario_id := to_jsonb(COALESCE(NEW, OLD))->>'scenario_id';
  IF v_scenario_id IS NOT NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := COALESCE(NEW.fiscal_year, OLD.fiscal_year);
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
