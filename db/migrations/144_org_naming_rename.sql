-- 144: Organizational workspace naming cleanup (Phase A of the coop_*/org_*
-- disambiguation). See docs/Causal_Development_Path.md's Open Decisions
-- entry ("coop_* vs cooperative_* naming cleanup") and the plan this
-- executes for full rationale.
--
-- Problem: `coop_*` has been used for two structurally opposite things --
-- data private to ONE org (34 tables) and, via the shared root, easily
-- confused with `cooperative_*` (4 tables), which really is shared ACROSS
-- orgs. An auditor or a dev scanning table names can't tell which regime
-- applies without reading the access-control code.
--
-- Fix: rename the 34 org-private tables to `org_*` -- matches the existing
-- `org_documents`/`org_document_expectations` precedent. The one table
-- that genuinely IS coop-scoped (the roster of which orgs belong to the
-- coop) becomes `coop_members`, deliberately keeping the `coop_` root
-- since that's now accurate rather than misleading. `cooperative_*` is
-- untouched -- already correctly named.
--
-- Columns are NOT renamed (coop_org_id stays everywhere, matching the
-- org_documents precedent) -- the ambiguity lives in table names, not a
-- column that's already unambiguous in context.
--
-- This is a metadata-only operation (ALTER TABLE/TYPE/SEQUENCE RENAME are
-- near-instant in Postgres, no data is copied or rewritten) but it MUST
-- land in the same deploy as the application code that references these
-- names -- every SQL query string in server/organizational/, server.js,
-- and server/individual/routes/workshop.js was updated in the same commit
-- as this migration. There is no safe intermediate state.

BEGIN;

-- ── Tables ──────────────────────────────────────────────────────────────

ALTER TABLE coop_orgs RENAME TO coop_members;

ALTER TABLE coop_accounts                      RENAME TO org_accounts;
ALTER TABLE coop_actuals                       RENAME TO org_actuals;
ALTER TABLE coop_allocation_lines              RENAME TO org_allocation_lines;
ALTER TABLE coop_allocation_monthly            RENAME TO org_allocation_monthly;
ALTER TABLE coop_allocation_schedules          RENAME TO org_allocation_schedules;
ALTER TABLE coop_audit_log                     RENAME TO org_audit_log;
ALTER TABLE coop_balance_sheet_snapshots       RENAME TO org_balance_sheet_snapshots;
ALTER TABLE coop_budget_lines                  RENAME TO org_budget_lines;
ALTER TABLE coop_constituent_interactions      RENAME TO org_constituent_interactions;
ALTER TABLE coop_constituents                  RENAME TO org_constituents;
ALTER TABLE coop_fringe_settings               RENAME TO org_fringe_settings;
ALTER TABLE coop_functional_classifications    RENAME TO org_functional_classifications;
ALTER TABLE coop_gifts                         RENAME TO org_gifts;
ALTER TABLE coop_grant_allocations             RENAME TO org_grant_allocations;
ALTER TABLE coop_grants                        RENAME TO org_grants;
ALTER TABLE coop_import_history                RENAME TO org_import_history;
ALTER TABLE coop_org_compliance_obligations    RENAME TO org_compliance_obligations;
ALTER TABLE coop_org_invites                   RENAME TO org_invites;
ALTER TABLE coop_org_members                   RENAME TO org_members;
ALTER TABLE coop_org_membership_payments       RENAME TO org_membership_payments;
ALTER TABLE coop_org_membership_reminders      RENAME TO org_membership_reminders;
ALTER TABLE coop_org_membership_tiers          RENAME TO org_membership_tiers;
ALTER TABLE coop_org_users                     RENAME TO org_users;
ALTER TABLE coop_personnel                     RENAME TO org_personnel;
ALTER TABLE coop_personnel_allocations         RENAME TO org_personnel_allocations;
ALTER TABLE coop_personnel_changes             RENAME TO org_personnel_changes;
ALTER TABLE coop_programs                      RENAME TO org_programs;
ALTER TABLE coop_projections                   RENAME TO org_projections;
ALTER TABLE coop_schedule_item_allocations     RENAME TO org_schedule_item_allocations;
ALTER TABLE coop_schedule_items                RENAME TO org_schedule_items;
ALTER TABLE coop_schedules                     RENAME TO org_schedules;
ALTER TABLE coop_sponsored_projects            RENAME TO org_sponsored_projects;
ALTER TABLE coop_tasks                         RENAME TO org_tasks;
ALTER TABLE coop_xero_program_track_map        RENAME TO org_xero_program_track_map;

-- ── Types / enums ───────────────────────────────────────────────────────

ALTER TYPE coop_account_type       RENAME TO org_account_type;
ALTER TYPE coop_actual_status      RENAME TO org_actual_status;
ALTER TYPE coop_org_member_role    RENAME TO org_member_role;
ALTER TYPE coop_task_status        RENAME TO org_task_status;

-- ── Sequences (cosmetic -- ALTER TABLE RENAME does not rename the owned
--    sequence automatically) ────────────────────────────────────────────

ALTER SEQUENCE coop_orgs_id_seq                            RENAME TO coop_members_id_seq;
ALTER SEQUENCE coop_accounts_id_seq                        RENAME TO org_accounts_id_seq;
ALTER SEQUENCE coop_actuals_id_seq                         RENAME TO org_actuals_id_seq;
ALTER SEQUENCE coop_allocation_lines_id_seq                RENAME TO org_allocation_lines_id_seq;
ALTER SEQUENCE coop_allocation_monthly_id_seq              RENAME TO org_allocation_monthly_id_seq;
ALTER SEQUENCE coop_allocation_schedules_id_seq            RENAME TO org_allocation_schedules_id_seq;
ALTER SEQUENCE coop_audit_log_id_seq                       RENAME TO org_audit_log_id_seq;
ALTER SEQUENCE coop_balance_sheet_snapshots_id_seq         RENAME TO org_balance_sheet_snapshots_id_seq;
ALTER SEQUENCE coop_budget_lines_id_seq                    RENAME TO org_budget_lines_id_seq;
ALTER SEQUENCE coop_constituent_interactions_id_seq        RENAME TO org_constituent_interactions_id_seq;
ALTER SEQUENCE coop_constituents_id_seq                    RENAME TO org_constituents_id_seq;
ALTER SEQUENCE coop_fringe_settings_id_seq                 RENAME TO org_fringe_settings_id_seq;
ALTER SEQUENCE coop_functional_classifications_id_seq      RENAME TO org_functional_classifications_id_seq;
ALTER SEQUENCE coop_gifts_id_seq                           RENAME TO org_gifts_id_seq;
ALTER SEQUENCE coop_grant_allocations_id_seq               RENAME TO org_grant_allocations_id_seq;
ALTER SEQUENCE coop_grants_id_seq                          RENAME TO org_grants_id_seq;
ALTER SEQUENCE coop_import_history_id_seq                  RENAME TO org_import_history_id_seq;
ALTER SEQUENCE coop_org_compliance_obligations_id_seq      RENAME TO org_compliance_obligations_id_seq;
ALTER SEQUENCE coop_org_invites_id_seq                     RENAME TO org_invites_id_seq;
ALTER SEQUENCE coop_org_members_id_seq                     RENAME TO org_members_id_seq;
ALTER SEQUENCE coop_org_membership_payments_id_seq         RENAME TO org_membership_payments_id_seq;
ALTER SEQUENCE coop_org_membership_reminders_id_seq        RENAME TO org_membership_reminders_id_seq;
ALTER SEQUENCE coop_org_membership_tiers_id_seq            RENAME TO org_membership_tiers_id_seq;
ALTER SEQUENCE coop_org_users_id_seq                       RENAME TO org_users_id_seq;
ALTER SEQUENCE coop_personnel_allocations_id_seq           RENAME TO org_personnel_allocations_id_seq;
ALTER SEQUENCE coop_personnel_changes_id_seq                RENAME TO org_personnel_changes_id_seq;
ALTER SEQUENCE coop_personnel_id_seq                       RENAME TO org_personnel_id_seq;
ALTER SEQUENCE coop_programs_id_seq                        RENAME TO org_programs_id_seq;
ALTER SEQUENCE coop_projections_id_seq                     RENAME TO org_projections_id_seq;
ALTER SEQUENCE coop_schedule_item_allocations_id_seq       RENAME TO org_schedule_item_allocations_id_seq;
ALTER SEQUENCE coop_schedule_items_id_seq                  RENAME TO org_schedule_items_id_seq;
ALTER SEQUENCE coop_schedules_id_seq                       RENAME TO org_schedules_id_seq;
ALTER SEQUENCE coop_sponsored_projects_id_seq              RENAME TO org_sponsored_projects_id_seq;
ALTER SEQUENCE coop_tasks_id_seq                           RENAME TO org_tasks_id_seq;
ALTER SEQUENCE coop_xero_program_track_map_id_seq          RENAME TO org_xero_program_track_map_id_seq;

-- ── RLS policies (migration 137) ───────────────────────────────────────
-- Policies stay attached to their table across a rename (Postgres tracks
-- them by OID, not name), so nothing breaks -- but their names still say
-- "coop_*" on tables now called "org_*". Rename each policy to match, for
-- anyone reading `\d+ org_accounts` later. coop_members (renamed from
-- coop_orgs) was excluded from migration 137's policies then and stays
-- excluded now -- its access model is a Phase B design question, not this
-- migration's.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename LIKE 'org\_%'
      AND policyname LIKE 'coop\_%'
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON %I.%I RENAME TO %I',
      r.policyname,
      r.schemaname,
      r.tablename,
      regexp_replace(r.policyname, '^coop_', 'org_')
    );
  END LOOP;
END $$;

COMMIT;
