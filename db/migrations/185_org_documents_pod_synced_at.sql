-- 185: Per-document sync confirmation.
--
-- org_settings.pod_last_synced_at is org-wide and fires unconditionally at
-- the end of a sync run, even if individual documents in that run failed -
-- it cannot answer "did THIS document actually reach the pod". This column
-- is that finer-grained fact, sitting alongside it (not replacing it):
-- null until this specific document's own PUT to the pod succeeds, set by
-- podSync.js's syncOrgToPod() immediately after that PUT succeeds, nothing
-- else touched if it fails.
--
-- Prerequisite for any future purge-local-copy work (tracking only in this
-- pass - no purge logic here): purging today would have no reliable
-- per-document signal to trigger on.

ALTER TABLE org_documents ADD COLUMN pod_synced_at timestamp with time zone;
