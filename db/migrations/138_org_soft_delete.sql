-- 138: Org soft-delete foundation.
--
-- Adds a "Delete Organization" flow to Settings (soft delete now, hard purge after a
-- 30-day recovery window via a scheduled job — see server/jobs/purge-deleted-orgs.js).
--
-- coop_audit_log.coop_org_id has no ON DELETE clause today (Postgres default NO ACTION),
-- unlike every other direct FK to coop_orgs(id), which are all ON DELETE CASCADE. That
-- means the eventual hard `DELETE FROM coop_orgs` the purge job performs would fail on
-- this table alone. Fix it to match the rest before the purge job can rely on cascade.

ALTER TABLE coop_audit_log
  DROP CONSTRAINT coop_audit_log_coop_org_id_fkey,
  ADD CONSTRAINT coop_audit_log_coop_org_id_fkey
    FOREIGN KEY (coop_org_id) REFERENCES coop_orgs(id) ON DELETE CASCADE;

ALTER TABLE coop_orgs
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coop_orgs_deleted_at ON coop_orgs (deleted_at) WHERE deleted_at IS NOT NULL;
