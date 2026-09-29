-- 167: Same cleanup as migration 165, for a column that query missed the first time --
-- `source_coop_org_id` (three tables, all referencing coop_members) wasn't caught by 165's
-- exact-match search for `coop_org_id`/`sponsor_coop_org_id`. Same concept (which org a row
-- originates from), same reason to fix it: leaving it half-renamed would be exactly the kind
-- of stray `coop_`-prefixed org-identifier column this whole effort exists to eliminate.

ALTER TABLE cooperative_work_library_items RENAME COLUMN source_coop_org_id TO source_org_id;
ALTER TABLE cooperative_library_submissions RENAME COLUMN source_coop_org_id TO source_org_id;
ALTER TABLE user_org_setup_presets RENAME COLUMN source_coop_org_id TO source_org_id;
