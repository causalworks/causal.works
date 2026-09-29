-- 215: generic attachment pair for org_documents, separate migration from 214's enum values
-- since a just-added enum value can't safely be referenced in the same transaction that added
-- it on some Postgres versions -- keeping these as two migrations avoids the question entirely.

ALTER TABLE org_documents
  ADD COLUMN source_ref_id bigint,
  ADD COLUMN source_ref_type text;

CREATE INDEX idx_org_documents_source_ref ON org_documents (org_id, source_ref_type, source_ref_id) WHERE source_ref_id IS NOT NULL;

COMMENT ON COLUMN org_documents.source_ref_id IS 'Generic attachment target, paired with source_ref_type -- e.g. a Bill or Invoice id. Matches the org_budget_lines/org_schedule_items convention rather than adding another single-purpose FK column like grant_id/obligation_id.';
COMMENT ON COLUMN org_documents.source_ref_type IS 'Discriminator for source_ref_id, e.g. ''bill'' or ''invoice''. NULL for documents not attached to one of these records.';
