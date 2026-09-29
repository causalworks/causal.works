-- 006_add_orgs_region.sql
-- Add region/scope to orgs so we can filter or label actions by location (national chapter vs global).
-- Values: 'US', 'EU', 'global', or NULL (unknown / treat as global for display).

ALTER TABLE orgs
    ADD COLUMN IF NOT EXISTS region TEXT;

COMMENT ON COLUMN orgs.region IS 'Optional: US, EU, global, or NULL. Used to prioritize or filter actions by user location.';
