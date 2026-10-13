-- 237: Board-designated funds -- Accounting build-order item #7, resolved as "track a running
-- balance via a ledger tag," mirroring how donor-restricted grants already work
-- (org_grants + donor_restriction_class tag on org_ledger_lines, balance = sum of tagged lines).
-- See .claude/plans/archive/2026-09-14-board-designated-funds-and-expense-claims-edit.md.
--
-- org_board_designations is the named-fund identity (like org_grants); board_designation_id on
-- org_ledger_lines is the activity tag (like grant_id). A designation's balance is just
-- SUM(credit_cents - debit_cents) over lines carrying its id -- no separate balance column to
-- keep in sync. No dedicated account is required or assumed to exist: an org tags whichever of
-- its own net-assets-without-restriction accounts it already uses (checked live against
-- demo-company: account-templates.js's 3000/3010 codes are just one of several optional
-- onboarding starter-COA templates exposed via GET .../account-templates, not a guaranteed
-- universal seed -- demo-company's real accounts are 3100/3200, with no board-designated
-- sub-account at all. Don't assume any specific code exists for any given org).
--
-- Both demo_org_reset_tables() and snapshot_demo_org() (156/165) auto-discover any table with an
-- org_id FK to coop_members via information_schema introspection, so org_board_designations is
-- automatically in scope for the nightly demo reset once this migration lands -- no separate
-- migration needed for that, but per CLAUDE.md, snapshot_demo_org() must be re-run once this is
-- applied so a snapshot actually exists for the new table before the nightly reset next runs.

CREATE TABLE org_board_designations (
  id SERIAL PRIMARY KEY,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  name text NOT NULL,
  purpose text,
  board_approved_date date,
  board_resolution_ref text,
  status text NOT NULL DEFAULT 'active',
  created_by integer REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_board_designations_status_check CHECK (status IN ('active', 'closed'))
);

CREATE INDEX idx_org_board_designations_org ON org_board_designations (org_id);

ALTER TABLE org_board_designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_board_designations FORCE ROW LEVEL SECURITY;
CREATE POLICY org_board_designations_org_isolation ON org_board_designations
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

ALTER TABLE org_ledger_lines ADD COLUMN board_designation_id integer REFERENCES org_board_designations(id);
CREATE INDEX idx_org_ledger_lines_board_designation ON org_ledger_lines (board_designation_id) WHERE board_designation_id IS NOT NULL;

COMMENT ON TABLE org_board_designations IS
  'Board-imposed internal earmarks of net assets without donor restriction (operating reserve, building fund, quasi-endowment). Not a distinct GAAP net-asset class -- ASU 2016-14 requires only a liquidity/appropriation disclosure, not a separate balance-sheet line. No specific account is required to exist; an org tags whichever of its own net-assets-without-restriction accounts it already uses.';
COMMENT ON COLUMN org_ledger_lines.board_designation_id IS
  'Tags a line as part of a "designate" or "release" transfer for a specific board designation, same pattern as grant_id for donor-restricted funds. A designation''s balance is SUM(credit_cents - debit_cents) over lines carrying its id.';
