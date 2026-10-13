-- 137: Row-Level Security foundation for coop_* tenant isolation
--
-- Per-org data (coop_* tables) is currently isolated only in application code, via a
-- hand-written `WHERE coop_org_id = $N` on every query (coopOrgIdForMember()). There is no
-- database-level backstop -- a route that forgets the clause leaks one org's data into
-- another's view with nothing at the DB layer to stop it. See "Open Decisions" in
-- docs/Causal_Development_Path.md.
--
-- This migration is foundation only. It adds a non-superuser app role and RLS policies keyed
-- off a session GUC (app.current_org_id), fail-closed when unset. It does NOT change how the
-- app connects (server.js still uses DB_USER=postgres, a superuser, which bypasses RLS), and
-- no route yet sets the GUC -- so this migration changes nothing about current app behavior.
-- Wiring routes through the new causal_app role + a scoped-query helper is a separate,
-- larger follow-up (touches ~hundreds of pool.query() call sites across
-- server/organizational/routes/*.js).
--
-- Scope: the 30 coop_* tables with a direct (or directly-named-differently) org column, plus
-- 4 tables scoped indirectly via a parent coop_* table's org column. Excluded: coop_orgs
-- itself (its id IS the org id -- a same-column policy would be circular; needs a
-- membership-based policy design, deferred) and all cooperative_* tables (intentional
-- cross-org sharing model, not tenant-private data).

-- ---------------------------------------------------------------------------
-- 1. Dedicated non-superuser app role
-- ---------------------------------------------------------------------------
-- RLS policies are inert against superusers and table owners (owned here by `postgres`)
-- regardless of policy or FORCE settings. A role that is neither is required for RLS to have
-- any effect. Password below is a placeholder -- rotate immediately after applying via
-- `ALTER ROLE causal_app WITH PASSWORD '...'` from an env-sourced value; do not commit a real
-- password to this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'causal_app') THEN
    CREATE ROLE causal_app LOGIN PASSWORD 'changeme_rotate_after_apply'
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END
$$;

GRANT CONNECT ON DATABASE causal_db TO causal_app;
GRANT USAGE ON SCHEMA public TO causal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO causal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO causal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO causal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO causal_app;

-- ---------------------------------------------------------------------------
-- 2. Directly-scoped tables (coop_org_id column)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'coop_accounts', 'coop_actuals', 'coop_allocation_schedules', 'coop_audit_log',
    'coop_balance_sheet_snapshots', 'coop_budget_lines', 'coop_constituent_interactions',
    'coop_constituents', 'coop_fringe_settings', 'coop_functional_classifications',
    'coop_gifts', 'coop_grant_allocations', 'coop_grants', 'coop_import_history',
    'coop_org_compliance_obligations', 'coop_org_invites', 'coop_org_members',
    'coop_org_membership_tiers', 'coop_org_users', 'coop_personnel',
    'coop_personnel_allocations', 'coop_personnel_changes', 'coop_programs',
    'coop_projections', 'coop_schedule_item_allocations', 'coop_schedule_items',
    'coop_schedules', 'coop_tasks', 'coop_xero_program_track_map'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I USING (coop_org_id = current_setting(''app.current_org_id'', true)::int)',
      t || '_org_isolation', t
    );
  END LOOP;
END
$$;

-- coop_sponsored_projects: same direct-column shape, different column name.
ALTER TABLE coop_sponsored_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_sponsored_projects FORCE ROW LEVEL SECURITY;
CREATE POLICY coop_sponsored_projects_org_isolation ON coop_sponsored_projects
  USING (sponsor_coop_org_id = current_setting('app.current_org_id', true)::int);

-- ---------------------------------------------------------------------------
-- 3. Indirectly-scoped tables (org id via a parent coop_* table)
-- ---------------------------------------------------------------------------
ALTER TABLE coop_allocation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_allocation_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY coop_allocation_lines_org_isolation ON coop_allocation_lines
  USING (EXISTS (
    SELECT 1 FROM coop_allocation_schedules s
    WHERE s.id = coop_allocation_lines.coop_allocation_schedule_id
      AND s.coop_org_id = current_setting('app.current_org_id', true)::int
  ));

ALTER TABLE coop_allocation_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_allocation_monthly FORCE ROW LEVEL SECURITY;
CREATE POLICY coop_allocation_monthly_org_isolation ON coop_allocation_monthly
  USING (EXISTS (
    SELECT 1 FROM coop_allocation_schedules s
    WHERE s.id = coop_allocation_monthly.coop_allocation_schedule_id
      AND s.coop_org_id = current_setting('app.current_org_id', true)::int
  ));

ALTER TABLE coop_org_membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_org_membership_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY coop_org_membership_payments_org_isolation ON coop_org_membership_payments
  USING (EXISTS (
    SELECT 1 FROM coop_org_members m
    WHERE m.id = coop_org_membership_payments.member_id
      AND m.coop_org_id = current_setting('app.current_org_id', true)::int
  ));

ALTER TABLE coop_org_membership_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE coop_org_membership_reminders FORCE ROW LEVEL SECURITY;
CREATE POLICY coop_org_membership_reminders_org_isolation ON coop_org_membership_reminders
  USING (EXISTS (
    SELECT 1 FROM coop_org_members m
    WHERE m.id = coop_org_membership_reminders.member_id
      AND m.coop_org_id = current_setting('app.current_org_id', true)::int
  ));
