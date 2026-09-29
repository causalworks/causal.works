-- 240: Scenario budgeting -- Budget item #14. Sparse delta-overlay model: a scenario row
-- exists only for a cell the user actually changed; everything else falls through to the
-- live org_budget_lines value for that account/program/grant/month. No touch to
-- org_budget_lines or any of its 16 consumers. See
-- .claude/plans/2026-09-14-scenario-budgeting-spec.md for full rationale, including why this
-- is two separate tables rather than a scenario_id column on org_budget_lines, and why these
-- tables deliberately do NOT get the fiscal-year-lock trigger (drafting a scenario against a
-- closed FY is legitimate forward planning; the lock still applies at promote-to-live, since
-- that write lands in org_budget_lines, which already carries the trigger).

CREATE TABLE org_budget_scenarios (
  id            SERIAL PRIMARY KEY,
  org_id        integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  fiscal_year   integer NOT NULL,
  name          text NOT NULL,
  description   text,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'archived')),
  created_by    integer REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_org_budget_scenarios_org_fy ON org_budget_scenarios (org_id, fiscal_year);

-- Sparse overlay: one row per cell this scenario overrides. No row = "use the live
-- org_budget_lines value for this cell." No FK to org_budget_lines itself -- a scenario can
-- introduce a brand-new account/program combo the live budget doesn't have yet.
CREATE TABLE org_budget_scenario_lines (
  id            SERIAL PRIMARY KEY,
  scenario_id   integer NOT NULL REFERENCES org_budget_scenarios(id) ON DELETE CASCADE,
  account_id    integer NOT NULL REFERENCES org_accounts(id) ON DELETE CASCADE,
  program_id    integer NOT NULL REFERENCES org_programs(id) ON DELETE CASCADE,
  grant_id      integer REFERENCES org_grants(id) ON DELETE SET NULL,
  month         smallint NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount_cents  bigint NOT NULL DEFAULT 0,
  created_at    timestamp with time zone DEFAULT now() NOT NULL,
  updated_at    timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_org_budget_scenario_lines_scenario ON org_budget_scenario_lines (scenario_id);
CREATE UNIQUE INDEX uq_org_budget_scenario_lines_cell ON org_budget_scenario_lines
  (scenario_id, account_id, program_id, COALESCE(grant_id, -1), month);

ALTER TABLE org_budget_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_budget_scenarios FORCE ROW LEVEL SECURITY;
CREATE POLICY org_budget_scenarios_org_isolation ON org_budget_scenarios
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

-- org_budget_scenario_lines has no own org_id; scope via its scenario's org_id (matches how
-- org_allocation_lines/org_allocation_monthly scope through org_allocation_schedules today).
ALTER TABLE org_budget_scenario_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_budget_scenario_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_budget_scenario_lines_org_isolation ON org_budget_scenario_lines
  USING (scenario_id IN (SELECT id FROM org_budget_scenarios));

COMMENT ON TABLE org_budget_scenarios IS
  'A named draft budget variant for a fiscal year (e.g. "Flat funding", "Growth -- new grant lands"). The live org_budget_lines table is the implicit baseline; scenarios never store a full copy, only the cells they override.';
COMMENT ON TABLE org_budget_scenario_lines IS
  'Sparse override cells for a scenario. Absence of a row for a given account/program/grant/month means "use the live org_budget_lines value." Promoting a scenario to live UPSERTs each override row into org_budget_lines and leaves untouched cells alone.';
