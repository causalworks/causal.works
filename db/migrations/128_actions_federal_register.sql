-- 128_actions_federal_register.sql
-- Persist Federal Register provenance for permitting/siting actions ingested
-- by the new permitting-job.js scheduled job. Follows the same additive,
-- nullable-column pattern as 018_actions_sender_metadata.sql.

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS fr_docket_number TEXT;

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS fr_agency TEXT;

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS fr_document_url TEXT;

-- Dedupe mechanism for this source, same shape as the existing exact-match
-- postmark_message_id dedupe for inbound email.
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_fr_docket_number_unique
  ON actions (fr_docket_number)
  WHERE fr_docket_number IS NOT NULL;

COMMENT ON COLUMN actions.fr_docket_number IS 'Federal Register document_number; unique per notice, used for ingest dedupe.';
COMMENT ON COLUMN actions.fr_agency IS 'Issuing agency name(s) from the Federal Register notice, joined if multiple.';
COMMENT ON COLUMN actions.fr_document_url IS 'Federal Register html_url for the notice (federalregister.gov).';
