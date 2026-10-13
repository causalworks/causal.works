-- 194: Caught during Phase 2 verification -- migration 192 built the writer-match guard trigger
-- (org_enforce_actuals_source_writer) but never actually extended org_actuals_source_check
-- itself, which still only allowed ('xero','csv'). The very first real recompute after flipping
-- an org to actuals_source='ledger' failed outright on this base CHECK before the guard trigger
-- even got a chance to matter. This is exactly the extension Ledger_Module_V1_Spec.md Section 2
-- called for and migration 192's own comment claimed to do -- doing it for real here.

ALTER TABLE org_actuals DROP CONSTRAINT org_actuals_source_check;
ALTER TABLE org_actuals ADD CONSTRAINT org_actuals_source_check
  CHECK (source = ANY (ARRAY['xero'::text, 'csv'::text, 'ledger'::text]));
