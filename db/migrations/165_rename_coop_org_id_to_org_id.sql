-- 165: Phase C of org/coop data separation -- rename the legacy `coop_org_id` column
-- (and `sponsor_coop_org_id`) to `org_id`/`sponsor_org_id` across the 34 pre-existing
-- org_* tables plus 3 tables outside that prefix that also carry it
-- (compliance_extension_proposals, cooperative_work_requests, workshop_space_members).
--
-- Column renames auto-propagate into RLS policy expressions and views (Postgres tracks
-- these by attnum/OID, not text) -- structurally safer than the rev 41 table rename.
-- The real risk, mirroring that rev 41 gotcha exactly: PL/pgSQL function bodies with a
-- hardcoded `coop_org_id` text reference do NOT auto-update (NEW.coop_org_id-style access
-- resolves against the live row descriptor at each call, not at function-creation time) --
-- every function containing that text (found via `prosrc ~ 'coop_org_id'`) is redefined
-- below in the same migration, not left to fail at next invocation.

-- ---------------------------------------------------------------------------
-- 1. Column renames
-- ---------------------------------------------------------------------------
ALTER TABLE compliance_extension_proposals RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE cooperative_work_requests RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_accounts RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_actuals RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_allocation_schedules RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_audit_log RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_balance_sheet_snapshots RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_budget_lines RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_compliance_obligations RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_constituent_interactions RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_constituents RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_document_expectations RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_documents RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_fringe_settings RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_functional_classifications RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_gifts RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_grant_allocations RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_grants RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_import_history RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_invites RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_members RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_membership_tiers RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_personnel RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_personnel_allocations RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_personnel_changes RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_programs RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_projections RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_schedule_item_allocations RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_schedule_items RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_schedules RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_sponsored_projects RENAME COLUMN sponsor_coop_org_id TO sponsor_org_id;
ALTER TABLE org_tasks RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_users RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE org_xero_program_track_map RENAME COLUMN coop_org_id TO org_id;
ALTER TABLE workshop_space_members RENAME COLUMN coop_org_id TO org_id;

-- ---------------------------------------------------------------------------
-- 2. Redefine every function with a hardcoded coop_org_id text reference
-- ---------------------------------------------------------------------------
-- admin_list_orgs_with_member_counts
CREATE OR REPLACE FUNCTION public.admin_list_orgs_with_member_counts()
 RETURNS TABLE(id integer, display_name text, slug text, created_at timestamp with time zone, member_count integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, o.display_name, o.slug, o.created_at,
         (SELECT COUNT(*)::int FROM org_users u WHERE u.org_id = o.id) AS member_count
  FROM coop_members o
  ORDER BY o.created_at DESC;
$function$;

-- bootstrap_demo_org_membership
CREATE OR REPLACE FUNCTION public.bootstrap_demo_org_membership(p_user_id integer)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO org_users (org_id, user_id, role)
  VALUES (v_org_id, p_user_id, 'staff')
  ON CONFLICT (org_id, user_id) DO NOTHING;
END;
$function$;

-- demo_org_reset_tables
CREATE OR REPLACE FUNCTION public.demo_org_reset_tables()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  SELECT ARRAY(
    SELECT c.table_name::text
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'org_id'
      AND c.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log')
    ORDER BY c.table_name
  );
$function$;

-- org_enforce_fiscal_year_lock
CREATE OR REPLACE FUNCTION public.org_enforce_fiscal_year_lock()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
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
$function$;

-- org_enforce_fiscal_year_lock_actuals
CREATE OR REPLACE FUNCTION public.org_enforce_fiscal_year_lock_actuals()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := org_fiscal_year_for_period(v_org_id, COALESCE(NEW.period_year, OLD.period_year), COALESCE(NEW.period_month, OLD.period_month));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- org_enforce_fiscal_year_lock_alloc_child
CREATE OR REPLACE FUNCTION public.org_enforce_fiscal_year_lock_alloc_child()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_schedule_id integer;
BEGIN
  v_schedule_id := COALESCE(NEW.coop_allocation_schedule_id, OLD.coop_allocation_schedule_id);
  SELECT org_id, fiscal_year INTO v_org_id, v_fy
    FROM org_allocation_schedules WHERE id = v_schedule_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- org_enforce_fiscal_year_lock_balance_sheet
CREATE OR REPLACE FUNCTION public.org_enforce_fiscal_year_lock_balance_sheet()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.org_id, OLD.org_id);
  v_fy := org_fiscal_year_for_date(v_org_id, COALESCE(NEW.as_of_date, OLD.as_of_date));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- resolve_member_org_id
CREATE OR REPLACE FUNCTION public.resolve_member_org_id(p_user_id integer, p_slug text, p_require_admin boolean DEFAULT false)
 RETURNS integer
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id
  FROM coop_members o
  INNER JOIN org_users m ON m.org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug
    AND (NOT p_require_admin OR m.role = 'admin')
  LIMIT 1;
$function$;

-- resolve_member_org_id_and_role
CREATE OR REPLACE FUNCTION public.resolve_member_org_id_and_role(p_user_id integer, p_slug text)
 RETURNS TABLE(org_id integer, role text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT o.id, m.role::text
  FROM coop_members o
  INNER JOIN org_users m ON m.org_id = o.id AND m.user_id = p_user_id
  WHERE o.slug = p_slug AND o.deleted_at IS NULL
  LIMIT 1;
$function$;

-- resolve_user_org_ids
CREATE OR REPLACE FUNCTION public.resolve_user_org_ids(p_user_id integer)
 RETURNS TABLE(org_id integer)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT org_id FROM org_users WHERE user_id = p_user_id;
$function$;

-- restore_demo_org
CREATE OR REPLACE FUNCTION public.restore_demo_org()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
  t text;
  tables text[] := demo_org_reset_tables();
  v_restored integer := 0;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_demo_snapshot LIMIT 1) THEN
    RETURN 0; -- never snapshotted yet; nothing to restore against
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', t);
  END LOOP;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DELETE FROM %I WHERE org_id = $1', t) USING v_org_id;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I,
         (SELECT COALESCE(jsonb_agg(row_data), ''[]''::jsonb) FROM org_demo_snapshot WHERE table_name = $1))',
      t, t
    ) USING t;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
  END LOOP;

  DELETE FROM org_audit_log WHERE org_id = v_org_id;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;

  RETURN v_restored;
EXCEPTION WHEN OTHERS THEN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;
  RAISE;
END;
$function$;

-- snapshot_demo_org
CREATE OR REPLACE FUNCTION public.snapshot_demo_org()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
  t text;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM org_demo_snapshot;

  FOREACH t IN ARRAY demo_org_reset_tables() LOOP
    EXECUTE format(
      'INSERT INTO org_demo_snapshot (table_name, row_data) SELECT %L, to_jsonb(x) FROM %I x WHERE x.org_id = $1',
      t, t
    ) USING v_org_id;
  END LOOP;

  RETURN (SELECT count(*)::integer FROM org_demo_snapshot);
END;
$function$;

