-- 146: Second follow-up to 144 -- constraint and index names are metadata
-- labels Postgres auto-generated from the OLD table names at creation time
-- (e.g. `coop_schedules_pkey`, `coop_accounts_budget_source_chk`). Like
-- sequences and RLS policies (handled inline in 144) and trigger/function
-- names (handled in 145), ALTER TABLE RENAME does not touch these -- they
-- stay attached to the right table (Postgres tracks them by OID), but the
-- label itself keeps saying the old name. Fixing them here for the same
-- reason 144/145 did: a stale label undermines the whole point of this
-- rename (raw constraint-violation errors surface these names verbatim).
--
-- Approach: for each (old_table, new_table) pair, rename any constraint or
-- index on that (now-renamed) table whose name still starts with the exact
-- old table name -- anchored per-row against the specific table a given
-- constraint/index actually belongs to, not a guessed prefix match, so
-- there's no ambiguity from one old name being a substring of another
-- (e.g. coop_personnel / coop_personnel_allocations).

BEGIN;

DO $$
DECLARE
  pair RECORD;
  r RECORD;
  new_conname text;
  new_indexname text;
BEGIN
  FOR pair IN
    SELECT * FROM (VALUES
      ('coop_orgs','coop_members'),
      ('coop_accounts','org_accounts'),
      ('coop_actuals','org_actuals'),
      ('coop_allocation_lines','org_allocation_lines'),
      ('coop_allocation_monthly','org_allocation_monthly'),
      ('coop_allocation_schedules','org_allocation_schedules'),
      ('coop_audit_log','org_audit_log'),
      ('coop_balance_sheet_snapshots','org_balance_sheet_snapshots'),
      ('coop_budget_lines','org_budget_lines'),
      ('coop_constituent_interactions','org_constituent_interactions'),
      ('coop_constituents','org_constituents'),
      ('coop_fringe_settings','org_fringe_settings'),
      ('coop_functional_classifications','org_functional_classifications'),
      ('coop_gifts','org_gifts'),
      ('coop_grant_allocations','org_grant_allocations'),
      ('coop_grants','org_grants'),
      ('coop_import_history','org_import_history'),
      ('coop_org_compliance_obligations','org_compliance_obligations'),
      ('coop_org_invites','org_invites'),
      ('coop_org_members','org_members'),
      ('coop_org_membership_payments','org_membership_payments'),
      ('coop_org_membership_reminders','org_membership_reminders'),
      ('coop_org_membership_tiers','org_membership_tiers'),
      ('coop_org_users','org_users'),
      ('coop_personnel','org_personnel'),
      ('coop_personnel_allocations','org_personnel_allocations'),
      ('coop_personnel_changes','org_personnel_changes'),
      ('coop_programs','org_programs'),
      ('coop_projections','org_projections'),
      ('coop_schedule_item_allocations','org_schedule_item_allocations'),
      ('coop_schedule_items','org_schedule_items'),
      ('coop_schedules','org_schedules'),
      ('coop_sponsored_projects','org_sponsored_projects'),
      ('coop_tasks','org_tasks'),
      ('coop_xero_program_track_map','org_xero_program_track_map')
    ) AS t(old_name, new_name)
  LOOP
    -- Constraints
    FOR r IN
      SELECT c.oid, c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = 'public' AND t.relname = pair.new_name
        AND c.conname LIKE pair.old_name || '%'
    LOOP
      new_conname := pair.new_name || substring(r.conname FROM length(pair.old_name) + 1);
      EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', pair.new_name, r.conname, new_conname);
    END LOOP;

    -- Indexes (only ones not already covered by a constraint rename above --
    -- constraint-backed indexes, e.g. pkey/unique, are renamed automatically
    -- when their owning constraint is renamed, so this only catches
    -- plain CREATE INDEX-created ones).
    FOR r IN
      SELECT i.indexname
      FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.tablename = pair.new_name
        AND i.indexname LIKE pair.old_name || '%'
    LOOP
      new_indexname := pair.new_name || substring(r.indexname FROM length(pair.old_name) + 1);
      IF new_indexname <> r.indexname THEN
        EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, new_indexname);
      END IF;
    END LOOP;
  END LOOP;
END $$;

COMMIT;
