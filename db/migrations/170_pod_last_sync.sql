-- 170: Per-org last-sync timestamp for the Solid pod feature.
--
-- Follow-up to 169. That migration's file-based last-sync log (from the
-- single-org pod-pilot demo) doesn't generalize once every org has its own
-- pod - the coop-wide Pod Management dashboard needs "last sync" per org in
-- a queryable column, not a single JSON file. Doc count is NOT stored here;
-- it's cheap to derive live via COUNT(*) on org_documents per org.

ALTER TABLE org_settings
    ADD COLUMN pod_last_synced_at timestamp with time zone;
