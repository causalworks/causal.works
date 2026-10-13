-- 261: close a real org-level RLS gap found by scripts/rls-coverage-audit.sql (2026-09-21).
--
-- compliance_extension_proposals (migration 062) is genuinely org-private data (org_id NOT
-- NULL, holds a proposal_status + cooperative_notes_markdown + decided_by_user_id per org) that
-- predates migration 137's RLS rollout by ~75 migrations and was simply never added to it --
-- not a documented exclusion the way cooperative_* tables are. Standard org-isolation pattern,
-- identical to every other table migration 137 covers -- no nuance here (unlike
-- org_document_expectations, which is 100% shared reference data today, or
-- user_org_setup_presets/workshop_space_members, which need a real design decision first).

ALTER TABLE compliance_extension_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_extension_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY compliance_extension_proposals_org_isolation ON compliance_extension_proposals
  USING (org_id = current_setting('app.current_org_id', true)::int);
