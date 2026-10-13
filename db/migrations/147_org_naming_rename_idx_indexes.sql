-- 147: Third follow-up to 144 -- indexes named `idx_coop_<table>_...` (the
-- `idx_` prefix meant the old-table-name prefix search in 146 didn't match
-- them) plus three constraints created with an abbreviated/truncated old
-- table name (`coop_alloc_schedules_*`, and one truncated at Postgres's
-- 63-char identifier limit: `coop_functional_classificatio_...`).

BEGIN;

DO $$
DECLARE
  pair RECORD;
  r RECORD;
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
    FOR r IN
      SELECT i.indexname
      FROM pg_indexes i
      WHERE i.schemaname = 'public' AND i.tablename = pair.new_name
        AND i.indexname LIKE 'idx\_' || pair.old_name || '%'
    LOOP
      new_indexname := 'idx_' || pair.new_name || substring(r.indexname FROM length('idx_' || pair.old_name) + 1);
      IF new_indexname <> r.indexname THEN
        EXECUTE format('ALTER INDEX %I RENAME TO %I', r.indexname, new_indexname);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Abbreviated / truncated stray constraint names, fixed by hand (only 3).
ALTER TABLE org_allocation_schedules
  RENAME CONSTRAINT coop_alloc_schedules_distribution_type_chk TO org_alloc_schedules_distribution_type_chk;
ALTER TABLE org_allocation_schedules
  RENAME CONSTRAINT coop_alloc_schedules_monthly_pattern_chk TO org_alloc_schedules_monthly_pattern_chk;
ALTER TABLE org_functional_classifications
  RENAME CONSTRAINT coop_functional_classificatio_coop_org_id_account_id_fiscal_key TO org_functional_classific_coop_org_id_account_id_fiscal_key;

COMMIT;
