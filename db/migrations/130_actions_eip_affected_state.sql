-- 130_actions_eip_affected_state.sql
-- Persist EIP Oil & Gas Watch's "Affected State" field verbatim. Same
-- additive, nullable-column pattern as 018_actions_sender_metadata.sql /
-- 129_actions_eip_oil_gas_watch.sql.
--
-- Stored as-is, including multi-state strings (e.g. "AL, MS") — no
-- normalization on write. Normalize at query time if/when needed so no
-- information is lost. Federal Register has no equivalent field at all
-- (confirmed against the live API's full document schema, 2026-08-06) —
-- fr_* rows will always have this column NULL, not sparsely populated.

ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS eip_affected_state TEXT;

COMMENT ON COLUMN actions.eip_affected_state IS 'Verbatim EIP "Affected State" value (e.g. "TX", "AL, MS" for multi-state projects). NULL for all non-EIP sources — Federal Register carries no equivalent field.';
