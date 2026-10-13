-- =============================================================================
-- 282_demo_reset_org_column_agnostic.sql
-- =============================================================================
-- Bug: demo_org_reset_tables() only picked up tables whose FK to coop_members(id) is
-- literally named `org_id`. Four tables use a differently-named column instead
-- (org_sponsored_projects.sponsor_org_id, cooperative_library_submissions.source_org_id,
-- cooperative_work_library_items.source_org_id, user_org_setup_presets.source_org_id) and
-- were silently excluded from both the nightly demo reset and snapshot_demo_org() — any
-- edit made to them on the demo org (e.g. renaming a sponsored project) survives forever
-- instead of resetting like every other demo edit.
--
-- Fix: demo_org_reset_tables() now discovers tables by FK-to-coop_members alone (any
-- column name); snapshot_demo_org()/restore_demo_org() resolve each table's actual
-- column name via demo_org_reset_org_column() instead of assuming the literal 'org_id'.
--
-- After this migration: re-run `SELECT snapshot_demo_org();` (also required by CLAUDE.md's
-- migration checklist) so the newly-covered tables get a baseline — otherwise their first
-- nightly reset would wipe them to empty instead of to a real baseline.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.demo_org_reset_org_column(p_table_name text)
RETURNS text
LANGUAGE sql
STABLE
AS $function$
  SELECT kcu.column_name::text
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name = p_table_name
    AND ccu.table_name = 'coop_members'
  ORDER BY (kcu.column_name <> 'org_id'), kcu.column_name
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.demo_org_reset_tables()
RETURNS text[]
LANGUAGE sql
STABLE
AS $function$
  SELECT ARRAY(
    SELECT DISTINCT tc.table_name::text
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'coop_members'
      AND tc.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log', 'org_pod_credentials')
    ORDER BY 1
  );
$function$;

CREATE OR REPLACE FUNCTION public.snapshot_demo_org()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
  t text;
  col text;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;

  DELETE FROM org_demo_snapshot;

  FOREACH t IN ARRAY demo_org_reset_tables() LOOP
    col := demo_org_reset_org_column(t);
    CONTINUE WHEN col IS NULL;
    EXECUTE format(
      'INSERT INTO org_demo_snapshot (table_name, row_data) SELECT %L, to_jsonb(x) FROM %I x WHERE x.%I = $1',
      t, t, col
    ) USING v_org_id;
  END LOOP;

  RETURN (SELECT count(*)::integer FROM org_demo_snapshot);
END;
$function$;

CREATE OR REPLACE FUNCTION public.restore_demo_org()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
  t text;
  col text;
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
    col := demo_org_reset_org_column(t);
    CONTINUE WHEN col IS NULL;

    EXECUTE format('DELETE FROM %I WHERE %I = $1', t, col) USING v_org_id;

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
