-- 156: nightly reset of Demo Company's demo content back to a baseline
-- snapshot, so shared edits from concurrent visitors don't compound over
-- time. Same shared-instance, timer-based pattern used by well-known demo
-- resets (e.g. open-demo-reset) and by this app's own digest jobs
-- (setInterval + a runXJob() function in server.js) -- not a per-user
-- sandbox, which would require virtualizing every query against these
-- tables and isn't worth the build for a demo workspace.
--
-- Deliberately excluded from reset (identity/access, not demo content):
--   org_users             -- app-login membership; migration 155's whole
--                             point is that this must NOT be wiped nightly
--   org_invites           -- pending invite records
--   org_membership_tiers  -- dues-tier configuration
--   org_audit_log         -- audit trail; cleared instead of restored, see
--                             restore_demo_org() below
--
-- Everything else with a coop_org_id column is real demo content (budget
-- lines, grants, personnel, constituents, etc.) and gets restored.
--
-- FK ordering across ~25 interrelated org_* tables (self-references,
-- cross-references, nullable created_by/updated_by -> users) makes a
-- manually topo-sorted DELETE/INSERT fragile and likely to break the next
-- time a table gains a new FK. Instead: DISABLE TRIGGER ALL for the
-- duration of the restore (standard bulk-reload technique -- Postgres
-- implements FK checks as triggers, so this suspends them, not just
-- audit/updated_at triggers), delete + reinsert in any order, re-enable.
-- Runs inside a single transaction (function body), so a mid-restore
-- error leaves triggers re-enabled via the exception handler rather than
-- leaving the org half-restored with FK checking off.

CREATE TABLE org_demo_snapshot (
  table_name text NOT NULL,
  row_data jsonb NOT NULL
);
-- No RLS, no direct grants to causal_app -- only reachable through the
-- SECURITY DEFINER functions below, same as coop_members admin ops.

CREATE OR REPLACE FUNCTION demo_org_reset_tables()
RETURNS text[]
LANGUAGE sql
STABLE
AS $$
  SELECT ARRAY(
    SELECT c.table_name::text
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'coop_org_id'
      AND c.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log')
    ORDER BY c.table_name
  );
$$;

CREATE OR REPLACE FUNCTION snapshot_demo_org()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      'INSERT INTO org_demo_snapshot (table_name, row_data) SELECT %L, to_jsonb(x) FROM %I x WHERE x.coop_org_id = $1',
      t, t
    ) USING v_org_id;
  END LOOP;

  RETURN (SELECT count(*)::integer FROM org_demo_snapshot);
END;
$$;

CREATE OR REPLACE FUNCTION restore_demo_org()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    EXECUTE format('DELETE FROM %I WHERE coop_org_id = $1', t) USING v_org_id;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I,
         (SELECT COALESCE(jsonb_agg(row_data), ''[]''::jsonb) FROM org_demo_snapshot WHERE table_name = $1))',
      t, t
    ) USING t;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
  END LOOP;

  DELETE FROM org_audit_log WHERE coop_org_id = v_org_id;

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
$$;

REVOKE ALL ON FUNCTION snapshot_demo_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION restore_demo_org() FROM PUBLIC;
REVOKE ALL ON FUNCTION demo_org_reset_tables() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION snapshot_demo_org() TO causal_app;
GRANT EXECUTE ON FUNCTION restore_demo_org() TO causal_app;
GRANT EXECUTE ON FUNCTION demo_org_reset_tables() TO causal_app;

-- Baseline snapshot: whatever Demo Company looks like right now becomes
-- "clean". Re-run snapshot_demo_org() manually later if you deliberately
-- want to move the baseline forward (e.g. after intentionally reseeding).
SELECT snapshot_demo_org();
