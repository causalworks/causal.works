-- 126: Platform-wide "starter" workshops.
--
-- workshop_projects visibility today (server/organizational/routes/cooperative.js) is
-- gated per-org: a workshop only shows up once the viewer's org has a
-- cooperative_work_library_items row pointing at it. That's right for org-specific
-- workshop output, but wrong for "Building the Cooperative" (migration 125) — that
-- workshop is meant to be the first thing any org, including ones that join later,
-- sees and can join to organize. Add a platform-wide flag so starter workshops are
-- visible to every org regardless of library-item linkage.

ALTER TABLE workshop_projects ADD COLUMN IF NOT EXISTS is_starter BOOLEAN NOT NULL DEFAULT false;

UPDATE workshop_projects SET is_starter = true WHERE slug = 'building-the-cooperative';
