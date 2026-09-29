-- 241: Scenario budgeting v2 -- input-fork tables for "Detailed Operational Scenario" mode.
-- See .claude/plans/2026-09-14-scenario-budgeting-v2-input-fork-spec.md for full rationale.
--
-- Adds scenario_id to the three tables that genuinely feed org_budget_lines via their own
-- recalc engines (personnelRecalc.js / scheduleRecalc.js / grantRecalc.js): org_personnel,
-- org_schedule_items, org_grant_allocations. NULL = live (default, no behavior change for
-- existing rows or existing recalc callers). org_personnel_allocations and
-- org_schedule_item_allocations need no column of their own -- they're scoped entirely through
-- their parent row's id, so forking the parent with a fresh id and pointing fresh child rows at
-- it is sufficient.
--
-- org_allocation_schedules/org_allocation_lines/org_allocation_monthly are deliberately NOT
-- touched here -- verified they only feed org_projections (the Projections/Indirect-Cost
-- forecast page), never org_budget_lines, so they're out of scope for Budget scenario planning.
--
-- scenario_type on org_budget_scenarios distinguishes v1's already-shipped "Quick Overlay"
-- scenarios (dollar overrides only) from v2's "Detailed Operational Scenario" (owns forked rows
-- in the tables above). Existing scenarios from migration 240 default to 'overlay'.

ALTER TABLE org_budget_scenarios
  ADD COLUMN scenario_type text NOT NULL DEFAULT 'overlay'
    CHECK (scenario_type IN ('overlay', 'detailed'));

ALTER TABLE org_personnel
  ADD COLUMN scenario_id integer REFERENCES org_budget_scenarios(id) ON DELETE CASCADE;
CREATE INDEX idx_org_personnel_scenario ON org_personnel (scenario_id) WHERE scenario_id IS NOT NULL;

ALTER TABLE org_schedule_items
  ADD COLUMN scenario_id integer REFERENCES org_budget_scenarios(id) ON DELETE CASCADE;
CREATE INDEX idx_org_schedule_items_scenario ON org_schedule_items (scenario_id) WHERE scenario_id IS NOT NULL;

ALTER TABLE org_grant_allocations
  ADD COLUMN scenario_id integer REFERENCES org_budget_scenarios(id) ON DELETE CASCADE;
CREATE INDEX idx_org_grant_allocations_scenario ON org_grant_allocations (scenario_id) WHERE scenario_id IS NOT NULL;

-- Replace the live-only unique constraint with one that folds in scenario_id (sentinel -1 for
-- live, same COALESCE pattern already used on org_budget_scenario_lines) so a scenario's forked
-- allocation row can coexist with the live one instead of colliding on the old constraint.
DROP INDEX idx_org_grant_allocations_unique;
CREATE UNIQUE INDEX idx_org_grant_allocations_unique ON org_grant_allocations
  (grant_id, coop_program_id, fiscal_year, COALESCE(scenario_id, -1));

COMMENT ON COLUMN org_personnel.scenario_id IS
  'NULL = live personnel record. Set only on rows forked into a detailed scenario (org_budget_scenarios.scenario_type = ''detailed'') -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';
COMMENT ON COLUMN org_schedule_items.scenario_id IS
  'NULL = live schedule item. Set only on rows forked into a detailed scenario -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';
COMMENT ON COLUMN org_grant_allocations.scenario_id IS
  'NULL = live allocation. Set only on rows forked into a detailed scenario -- see 2026-09-14-scenario-budgeting-v2-input-fork-spec.md.';
