-- 243: org_budget_scenario_lines.program_id must allow NULL to match org_budget_lines'
-- nullability -- an unallocated schedule item (no program_id, no allocation rows) can produce
-- a NULL-program budget line on the live path (scheduleRecalc.js), and a detailed scenario's
-- recalc of that same item must be able to write the equivalent scenario line. Zero live rows
-- exercise this today, but the code path is real and this closes the gap before the scenario
-- recalc write path (migration 241/242 follow-on) needs it.
--
-- The existing unique index treated program_id as always-present; NULL != NULL under Postgres'
-- default unique-index semantics would have silently allowed duplicate override rows for the
-- same unallocated cell, so program_id gets the same COALESCE sentinel treatment grant_id
-- already has.

ALTER TABLE org_budget_scenario_lines ALTER COLUMN program_id DROP NOT NULL;

DROP INDEX uq_org_budget_scenario_lines_cell;
CREATE UNIQUE INDEX uq_org_budget_scenario_lines_cell ON org_budget_scenario_lines
  (scenario_id, account_id, COALESCE(program_id, -1), COALESCE(grant_id, -1), month);
