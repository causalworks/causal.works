-- 262: extend the program-scope RLS backstop (migration 259/260) to the columns confirmed
-- live-but-uncovered by scripts/rls-coverage-audit.sql, per
-- .claude/plans/2026-09-19-solid-odi-demo-readiness.md's "RLS coverage tooling" section.
--
-- Migration 259 covered 14 program_id-bearing tables found by name-matching "program_id".
-- Running the schema-driven audit afterward found more real FK-into-org_programs columns that
-- weren't named program_id, so the original search missed them. All were triaged 2026-09-21 by
-- checking actual usage repo-wide (not assumed) and confirmed live, shipped features -- not dead
-- scaffolding for the still-unscheduled Activity-level budgeting feature. See the plan doc's
-- "Correction to the unshipped feature triage" note.
--
-- Excluded on purpose: org_programs.parent_id (self-referential program/activity hierarchy
-- mechanism used by programs.js's dimension computation -- not an access-control boundary into a
-- foreign entity the way every other flagged column is).
--
-- org_budget_lines is a special case: it already has a program_scope policy from migration 259
-- covering program_id only. activity_id is a second, independent FK into org_programs on the
-- same row (an activity-tagged line is filed under a program AND optionally an activity) --
-- programUsage.js's own existing `program_id = $2 OR activity_id = $2` pattern shows a row should
-- be in scope if EITHER matches, so the fix is to replace that one policy with an OR-combined
-- version rather than add a second RESTRICTIVE policy (two RESTRICTIVE policies AND together,
-- which would wrongly require both columns to match).
--
-- org_actuals is the other OR case: org_program_id and org_activity_id are two independent
-- nullable FKs into org_programs on the same row, no pre-existing policy to replace.
--
-- Everywhere else: single column, same shape as migration 259's originals. NULL = ANY(array) is
-- NULL (not true) in Postgres, so a NULL scope column is correctly excluded once a program
-- restriction is active, with no explicit IS NOT NULL guard needed -- same reasoning migration
-- 259 already documented.

DROP POLICY org_budget_lines_program_scope ON org_budget_lines;
CREATE POLICY org_budget_lines_program_scope ON org_budget_lines AS RESTRICTIVE USING (
  current_program_ids() IS NULL
  OR program_id = ANY(current_program_ids())
  OR activity_id = ANY(current_program_ids())
);

CREATE POLICY org_actuals_program_scope ON org_actuals AS RESTRICTIVE USING (
  current_program_ids() IS NULL
  OR org_program_id = ANY(current_program_ids())
  OR org_activity_id = ANY(current_program_ids())
);

DO $$
DECLARE
  t text;
  col text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_grants:primary_program_id',
    'org_grant_allocations:coop_program_id',
    'org_schedule_item_allocations:coop_program_id',
    'org_allocation_lines:coop_program_id',
    'org_bank_rules:action_program_id',
    'org_personnel_allocations:coop_program_id',
    'org_projections:coop_program_id',
    'org_xero_program_track_map:coop_program_id'
  ]
  LOOP
    col := split_part(t, ':', 2);
    t := split_part(t, ':', 1);
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE USING (current_program_ids() IS NULL OR %I = ANY(current_program_ids()))',
      t || '_program_scope', t, col
    );
  END LOOP;
END
$$;
