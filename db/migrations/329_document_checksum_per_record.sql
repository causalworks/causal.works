-- An identical file may back several records. Vault documents (no source record) stay unique per organization;
-- a document attached to a record is unique per record.
DROP INDEX IF EXISTS uq_org_documents_org_checksum;
CREATE UNIQUE INDEX uq_org_documents_vault_checksum ON org_documents (org_id, checksum_sha256) WHERE archived_at IS NULL AND source_ref_type IS NULL;
CREATE UNIQUE INDEX uq_org_documents_record_checksum ON org_documents (org_id, checksum_sha256, source_ref_type, source_ref_id) WHERE archived_at IS NULL AND source_ref_type IS NOT NULL;
