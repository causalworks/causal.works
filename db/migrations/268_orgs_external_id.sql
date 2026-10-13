-- Stable, opaque external identifier for Agency orgs, separate from the local integer id.
-- Groundwork only: nothing reads it yet. Lets a future curated-pull model reference an org
-- without depending on this database's integer key. See
-- .claude/plans/2026-09-24-agency-cooperative-decoupling-review.md.
-- Undo: DROP INDEX orgs_external_id_key; ALTER TABLE orgs DROP COLUMN external_id;

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS external_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS orgs_external_id_key ON orgs (external_id);

COMMENT ON COLUMN orgs.external_id IS 'Stable opaque identifier for referencing this org outside this database. Never reused or edited; orgs.id stays the local key for all existing foreign keys.';
