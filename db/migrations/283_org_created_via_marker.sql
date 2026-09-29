-- 283: marker column identifying orgs created through the invited-sample-data flow
-- (see .claude/plans/2026-09-28-seeded-sample-org-creation.md), so they can be found
-- and bulk-cleaned later without hunting by name (the existing problem with stale
-- test workspaces org-1/loop3/earthsong sitting in the backlog undeleted).
--
-- Distinct from is_platform_demo: that flag means "the one shared sandbox everyone is
-- auto-enrolled into." This flags a real, single-tenant org an invited person created
-- through the seeded-sample path -- normal in every other respect (full admin access,
-- no Members/Danger-Zone masking), just tagged for a later cleanup pass.

ALTER TABLE coop_members ADD COLUMN created_via text;

ALTER TABLE coop_members ADD CONSTRAINT coop_members_created_via_check
  CHECK (created_via IS NULL OR created_via = 'invited_sample');
