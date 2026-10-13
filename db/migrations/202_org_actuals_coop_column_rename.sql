-- 202: naming cleanup, explicitly deferred when the Ledger schema was first built (migration
-- 191+) and reopened now that Purchases/Sales is being speced -- nothing coop_-prefixed belongs
-- in Accounting-module naming going forward. org_actuals still carried three columns from
-- before the coop_*->org_* table rename (commit 817de00): coop_account_id, coop_program_id,
-- coop_activity_id. This is the table the Ledger's own actuals-bridge (migration 192) writes
-- into directly, so it's squarely Accounting-module surface, not just a stale name elsewhere.
--
-- Scope note: a platform-wide grep turned up the same coop_ prefix on FK columns in several
-- other tables (org_allocation_lines, org_personnel_allocations, org_schedule_item_allocations,
-- org_grant_allocations, org_projections, org_balance_sheet_snapshots, org_xero_program_track_map)
-- -- confirmed NONE of them are read or written by any Ledger/Bank Reconciliation code path
-- (server/organizational/routes/ledger.js, lib/ledgerPosting.js, routes/bankReconciliation.js).
-- Those are Budget/Personnel/Grants/Projections module internals, out of scope for this pass --
-- left untouched deliberately, not missed. Flagged separately for the user to decide on as its
-- own future cleanup if wanted platform-wide.

ALTER TABLE org_actuals RENAME COLUMN coop_account_id TO org_account_id;
ALTER TABLE org_actuals RENAME COLUMN coop_program_id TO org_program_id;
ALTER TABLE org_actuals RENAME COLUMN coop_activity_id TO org_activity_id;

-- Constraint/index names follow the column rename for consistency; Postgres already updated the
-- underlying definitions automatically on RENAME COLUMN, this just fixes the displayed names.
ALTER TABLE org_actuals RENAME CONSTRAINT org_actuals_coop_account_id_fkey TO org_actuals_org_account_id_fkey;
ALTER TABLE org_actuals RENAME CONSTRAINT org_actuals_coop_program_id_fkey TO org_actuals_org_program_id_fkey;
ALTER TABLE org_actuals RENAME CONSTRAINT org_actuals_coop_activity_id_fkey TO org_actuals_org_activity_id_fkey;

-- Trigger function + its binding both reference the column by name.
CREATE OR REPLACE FUNCTION org_enforce_posting_account_actuals() RETURNS trigger AS $$
BEGIN
  IF NEW.org_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM org_accounts a WHERE a.id = NEW.org_account_id AND a.is_posting IS TRUE
  ) THEN
    RAISE EXCEPTION 'org_actuals.org_account_id % must reference a posting org_accounts row', NEW.org_account_id
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER trg_org_actuals_posting_account ON org_actuals;
CREATE TRIGGER trg_org_actuals_posting_account BEFORE INSERT OR UPDATE OF org_account_id ON org_actuals
  FOR EACH ROW EXECUTE FUNCTION org_enforce_posting_account_actuals();
