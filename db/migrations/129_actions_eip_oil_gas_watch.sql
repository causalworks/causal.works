-- 129_actions_eip_oil_gas_watch.sql
-- Persist EIP Oil & Gas Watch provenance for state-permit-tier actions
-- ingested by server/jobs/eip-oil-gas-watch-job.js. Follows the same
-- additive, nullable-column pattern as 018_actions_sender_metadata.sql /
-- 128_actions_federal_register.sql.

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS eip_alert_id TEXT;

-- Dedupe/upsert key. Unlike Federal Register's insert-once-per-docket model,
-- the same EIP alert can reappear across daily exports (still Active, deadline
-- extended, etc.) — this job upserts on eip_alert_id rather than skip-if-exists.
CREATE UNIQUE INDEX IF NOT EXISTS idx_actions_eip_alert_id_unique
  ON actions (eip_alert_id)
  WHERE eip_alert_id IS NOT NULL;

COMMENT ON COLUMN actions.eip_alert_id IS 'UUID from the EIP Oil & Gas Watch alert''s OGW URL (oilandgaswatch.org/alert/{id}); unique per alert, used as the upsert key.';
