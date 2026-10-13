-- 242: Lineage columns on org_budget_scenario_lines, mirroring org_budget_lines' own
-- source_type/source_ref_id/source_ref_type/is_override pattern. Needed so a detailed
-- scenario's recalc engines (personnel/schedule/grant_allocation) can delete-and-reinsert only
-- their own computed rows without clobbering a user's manual dollar-overlay edit on the same
-- cell, exactly the same protection org_budget_lines already gives live recalcs via
-- is_override. See .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md.
--
-- Existing rows (all from v1's Quick Overlay, migration 240) are all manual by construction --
-- default source_type='manual' is correct for every row that already exists, no backfill needed.

ALTER TABLE org_budget_scenario_lines
  ADD COLUMN source_type text NOT NULL DEFAULT 'manual'
    CHECK (source_type IN ('manual', 'personnel', 'schedule', 'grant_allocation')),
  ADD COLUMN source_ref_id integer,
  ADD COLUMN source_ref_type text,
  ADD COLUMN is_override boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN org_budget_scenario_lines.source_type IS
  '''manual'' = user typed this override directly (v1 Quick Overlay behavior, or an explicit override inside a detailed scenario). ''personnel''/''schedule''/''grant_allocation'' = written by that recalc engine from the scenario''s forked inputs; wiped and rewritten on every recalc unless is_override is true.';
COMMENT ON COLUMN org_budget_scenario_lines.is_override IS
  'True once a user has manually edited a cell that a recalc engine also writes to -- protects it from being overwritten on the next scenario recalc, same semantics as org_budget_lines.is_override.';
