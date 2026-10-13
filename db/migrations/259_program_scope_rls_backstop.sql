-- 259: RLS backstop for program-scoped access (.claude/plans/2026-09-19-solid-odi-demo-readiness.md,
-- "Finding (2026-09-20)").
--
-- The org-level internal permission system's 'program' role is currently enforced only in the
-- application layer (server/organizational/lib/programScope.js, wired into budget-lines.js so
-- far). Per the finding above, that's the wrong shape on its own -- current best practice for
-- Postgres multi-tenant SaaS is RLS-as-backstop + app-layer-filtering-as-fast-path, not app-layer
-- alone, and a future route that forgets to call programScopeFor() would otherwise silently leak
-- every program's rows to a program-scoped user with nothing at the DB layer to catch it.
--
-- This extends the exact mechanism already proven for org isolation (migration 137:
-- app.current_org_id GUC + a permissive per-table policy) with a second GUC,
-- app.current_program_ids, holding a comma-joined array of program ids (or unset, meaning "no
-- restriction" -- the admin/finance case). Unlike org isolation, this is a RESTRICTIVE policy:
-- it must AND with the existing org-isolation PERMISSIVE policy, not OR with it, since a
-- program-scoped row must satisfy BOTH "in my org" AND "in my program(s)".
--
-- current_program_ids() semantics:
--   - GUC unset (NULL)   -> returns NULL  -> policy passes every row (admin/finance/legacy staff;
--                                             matches programScope.js's programScopeFor() returning
--                                             null for these roles)
--   - GUC = ''           -> returns '{}'  -> policy passes NO row (a 'program' user with zero
--                                             grants yet -- a real empty state, not an error;
--                                             matches programScopeFor() returning [] for this case)
--   - GUC = '3,7'        -> returns {3,7} -> policy passes rows where program_id IN (3,7)
--
-- A row with program_id IS NULL (org-wide/unassigned) is excluded once a program restriction is
-- active, same as the existing app-layer `column = ANY($n::int[])` filter already behaves (NULL
-- = ANY(...) is NULL, not true) -- no behavior divergence between the two layers.
--
-- Scope: the 14 program_id-bearing tables identified in the plan's per-module audit. All already
-- have FORCE RLS + an org_isolation policy from migration 137 (or its later org_/coop_ rename) --
-- verified via pg_policies before writing this migration, not assumed.

CREATE OR REPLACE FUNCTION current_program_ids() RETURNS int[] AS $$
  SELECT CASE
    WHEN current_setting('app.current_program_ids', true) IS NULL THEN NULL
    WHEN current_setting('app.current_program_ids', true) = '' THEN ARRAY[]::int[]
    ELSE string_to_array(current_setting('app.current_program_ids', true), ',')::int[]
  END;
$$ LANGUAGE sql STABLE;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_bill_credit_notes', 'org_bill_lines', 'org_budget_lines', 'org_budget_scenario_lines',
    'org_expense_claim_lines', 'org_fixed_assets', 'org_gifts', 'org_invoice_credit_notes',
    'org_invoice_lines', 'org_ledger_lines', 'org_membership_tiers', 'org_program_grants',
    'org_schedule_items', 'org_sponsored_projects'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I AS RESTRICTIVE USING (current_program_ids() IS NULL OR program_id = ANY(current_program_ids()))',
      t || '_program_scope', t
    );
  END LOOP;
END
$$;
