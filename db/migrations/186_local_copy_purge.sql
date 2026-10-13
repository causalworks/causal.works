-- 186: Local-copy purge tracking. Phase 2 of the pod-sync-confirmation work
-- (rev 62 shipped pod_synced_at as the prerequisite fact this phase depends
-- on entirely). null until a document's local file is actually deleted from
-- disk; stored_path and checksum_sha256 are deliberately kept on the row
-- even after purge - stored_path as a historical record of where the file
-- used to live, checksum_sha256 as the integrity anchor for verifying
-- pod-fetched content still matches what was originally uploaded.

ALTER TABLE org_documents ADD COLUMN local_copy_purged_at timestamp with time zone;
