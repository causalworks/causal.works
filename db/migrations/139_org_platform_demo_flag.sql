-- 139: Protect the platform's demo org from deletion.
--
-- Demo Company is a platform-controlled fixture (referenced by demo-content seed
-- migrations, e.g. 122/125), not a real tenant — it must never be deletable via the new
-- Delete Organization flow (migration 138). Rather than hardcode its slug (slugs are
-- regenerated from display_name on rename, per project memory — unstable to match on)
-- or its numeric id, add a stable boolean flag on coop_orgs itself.

ALTER TABLE coop_orgs ADD COLUMN IF NOT EXISTS is_platform_demo BOOLEAN NOT NULL DEFAULT false;

UPDATE coop_orgs SET is_platform_demo = true WHERE slug = 'demo-company';
