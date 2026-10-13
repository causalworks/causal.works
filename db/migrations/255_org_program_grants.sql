-- 255: Step A of the org-level internal permission system (Phase 1 of
-- .claude/plans/2026-09-19-solid-odi-demo-readiness.md) -- pure additive
-- schema, zero behavior change. Existing code still only checks
-- 'staff'/'admin' (orgs.js's two hardcoded validation arrays,
-- requireOrgRole()), so this migration does not touch any existing
-- org_users.role data -- that cutover ('staff' -> 'finance') is Step C,
-- deliberately last, only once Step B's code changes are verified working.
--
-- org_member_role already carries a third, unused value ('board' -- see
-- vendorCompliance.js's own comment confirming no code path can ever assign
-- it) with no ill effect, so adding two more additive values here follows an
-- already-safe pattern, not a new risk.
--
-- 'finance' -- full org-wide access including personnel (matches what
-- 'staff' already behaves like today; Step C relabels existing 'staff' rows
-- to this value).
-- 'program' -- scoped to specific program(s) via org_program_grants below.
-- Personnel visibility for this role is allocation-only (the percentage/
-- amount allocated to their program(s), not the full org_personnel row --
-- see the design doc) -- enforced in application code (Step B), not by RLS
-- here, since it's a field-level distinction, not a row-level one.
ALTER TYPE org_member_role ADD VALUE 'finance';
ALTER TYPE org_member_role ADD VALUE 'program';

-- Which program(s) a 'program'-role org_users row is scoped to. Modeled as
-- grant rows (not a single program_id column on org_users) deliberately --
-- per the plan's extensibility decision, some future coops may need a
-- person granted several programs at once rather than the fixed
-- admin/finance/program role names being the only shape ever needed. A
-- fixed role is a named shorthand for a common grant shape; this table is
-- what lets that evolve later without a schema rebuild.
CREATE TABLE org_program_grants (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    org_user_id integer NOT NULL REFERENCES org_users(id) ON DELETE CASCADE,
    program_id integer NOT NULL REFERENCES org_programs(id) ON DELETE CASCADE,
    created_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    UNIQUE (org_user_id, program_id)
);

CREATE INDEX idx_org_program_grants_org ON org_program_grants (org_id);
CREATE INDEX idx_org_program_grants_user ON org_program_grants (org_user_id);
CREATE INDEX idx_org_program_grants_program ON org_program_grants (program_id);

ALTER TABLE org_program_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_program_grants FORCE ROW LEVEL SECURITY;
CREATE POLICY org_program_grants_org_isolation ON org_program_grants
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE org_program_grants TO causal_app;
GRANT USAGE ON SEQUENCE org_program_grants_id_seq TO causal_app;
