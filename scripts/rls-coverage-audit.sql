-- RLS coverage audit -- run after ANY migration that adds/changes a table or a foreign key.
--
-- Usage:
--   sudo -u postgres psql causal_db -f scripts/rls-coverage-audit.sql
--
-- Why this exists (2026-09-21): migration 259's list of "14 program_id-bearing tables" was
-- built by grepping for columns literally named program_id -- which is exactly why it missed
-- org_grants.primary_program_id and org_grant_allocations.coop_program_id. A hardcoded table
-- list goes stale the moment someone names a column differently or adds a new table. This
-- script instead walks the actual foreign-key graph, so a new table added next month with
-- ANY column referencing a scope-parent table is picked up automatically, with zero edits here.
--
-- The one thing that IS still manual, by necessity: the two-row `scope_parents` list below.
-- Adding a genuinely new scoping DIMENSION (a third axis beyond org/program) means adding a
-- row here -- a rare, deliberate architecture decision, not an incidental "forgot a table."
--
-- What this catches:
--   1. A table with a real FK into a scope-parent table but RLS not enabled at all.
--   2. RLS enabled but not FORCED -- the table owner (and any raw-superuser connection)
--      bypasses every policy silently. This is the single most dangerous gap: it looks
--      covered (policies exist) but isn't, for exactly the role most likely to run ad-hoc
--      queries or migrations.
--   3. RLS enabled + forced, but zero policies defined for that scope column specifically
--      (a table can have SOME policy, e.g. org isolation, but no program-scope policy).
--   4. A policy that only covers SELECT (polcmd = 'r') on a scope column that also gets
--      written to -- this shape silently protects reads but not writes (the "classic RLS
--      bug": USING without an effective WITH CHECK). ALL-scoped policies (polcmd = '*') are
--      fine -- Postgres applies USING as the implicit check for those; verified live against
--      migration 259's own policies before writing this script, not assumed from docs.
--
-- What this CANNOT catch (see the pgTAP-style test script, rls-coverage-test.js, for these):
--   - A column that SHOULD be scoped but has no FK constraint at all (relies on convention).
--   - Whether the application code actually sets the GUC before querying (a schema audit
--     can't see request-time behavior -- that's what the runtime test script is for).

\pset border 2
\pset format aligned

-- Scope-parent tables: the ONE manually-curated list in this whole script. Add a row here
-- only when a genuinely new scoping dimension is introduced. `scope_marker` is the
-- characteristic GUC/function name that dimension's policies reference in their USING
-- expression -- used below to tell "this table has SOME policy" apart from "this table has
-- a policy for THIS scope specifically" (a real bug caught 2026-09-21: a table with only an
-- org_isolation policy was wrongly reported "covered" for program scope too, because the
-- first version of this script checked "any write-covering policy exists" instead of "a
-- policy for this dimension exists" -- org_grants/org_grant_allocations have org-level RLS
-- but NO program-level policy at all, and the buggy version missed that entirely).
WITH scope_parents(scope_name, parent_table, scope_marker) AS (
  VALUES
    ('org (tenant)', 'coop_members', 'current_org_id'),
    ('program',      'org_programs', 'current_program_ids')
),

-- Every column, on every table, that has a foreign key into one of the scope-parent tables --
-- found via pg_constraint, NOT by matching column name text. This is what makes the audit
-- durable: primary_program_id and coop_program_id are found exactly the same way program_id is.
scoped_columns AS (
  SELECT
    sp.scope_name,
    sp.scope_marker,
    con.conrelid::regclass::text AS table_name,
    att.attname AS column_name
  FROM pg_constraint con
  JOIN scope_parents sp ON con.confrelid = to_regclass(sp.parent_table)
  JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
  WHERE con.contype = 'f'
),

table_rls_state AS (
  SELECT
    c.oid,
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    c.relforcerowsecurity AS rls_forced
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
),

-- Every policy on every table, with its command scope and USING expression text -- joined
-- against scoped_columns per-row below so "does a policy exist for THIS dimension" is
-- checked by searching for that dimension's marker in the expression, not just "does any
-- policy exist on this table" (the bug described above).
policy_detail AS (
  SELECT
    polrelid,
    polcmd,
    pg_get_expr(polqual, polrelid) AS using_expr
  FROM pg_policy
),
policy_state AS (
  -- Requires the qual to mention BOTH the scope's marker (current_org_id / current_program_ids)
  -- AND this specific column's name -- a table with two columns FK'd into the same scope
  -- parent (e.g. org_budget_lines.program_id AND .activity_id both -> org_programs) can have a
  -- policy that only actually restricts one of them; matching on the marker alone wrongly
  -- reported activity_id as "covered" via program_id's own policy (caught 2026-09-21, same
  -- session as the first bug -- this script needed two rounds of self-correction before its
  -- output could be trusted, which is itself the point: verify the verifier).
  SELECT
    sc.scope_name,
    sc.table_name,
    sc.column_name,
    COUNT(pd.polcmd) FILTER (
      WHERE pd.using_expr ILIKE '%' || sc.scope_marker || '%'
        AND pd.using_expr ILIKE '%' || sc.column_name || '%'
    ) AS scoped_policy_count,
    bool_or(
      pd.polcmd IN ('*', 'a', 'w')
      AND pd.using_expr ILIKE '%' || sc.scope_marker || '%'
      AND pd.using_expr ILIKE '%' || sc.column_name || '%'
    ) AS has_write_covering_scoped_policy
  FROM scoped_columns sc
  LEFT JOIN table_rls_state trs ON trs.table_name = sc.table_name
  LEFT JOIN policy_detail pd ON pd.polrelid = trs.oid
  GROUP BY sc.scope_name, sc.table_name, sc.column_name
)

SELECT
  sc.scope_name,
  sc.table_name,
  sc.column_name,
  CASE
    WHEN trs.oid IS NULL THEN 'TABLE NOT FOUND (stale FK / dropped table?)'
    WHEN NOT trs.rls_enabled THEN 'MISSING: RLS not enabled at all'
    WHEN NOT trs.rls_forced THEN 'GAP: RLS enabled but NOT FORCED -- table owner bypasses every policy'
    WHEN ps.scoped_policy_count IS NULL OR ps.scoped_policy_count = 0
      THEN 'MISSING: no policy references this scope''s marker (' || sc.scope_marker || ') at all'
    WHEN NOT ps.has_write_covering_scoped_policy
      THEN 'GAP: this scope''s policy only covers SELECT -- writes are unprotected for this dimension'
    ELSE 'covered'
  END AS status
FROM scoped_columns sc
LEFT JOIN table_rls_state trs ON trs.table_name = sc.table_name
LEFT JOIN policy_state ps ON ps.scope_name = sc.scope_name AND ps.table_name = sc.table_name AND ps.column_name = sc.column_name
ORDER BY
  (CASE
    WHEN trs.oid IS NULL OR NOT trs.rls_enabled OR NOT trs.rls_forced
      OR ps.scoped_policy_count IS NULL OR ps.scoped_policy_count = 0 OR NOT ps.has_write_covering_scoped_policy
    THEN 0 ELSE 1
  END),
  sc.scope_name, sc.table_name;
