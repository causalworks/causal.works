-- 218: Bank_Reconciliation_V1_Spec.md Section 2.1 -- amount_cents was built as a plain signed
-- bigint with no credit_debit_indicator column, reintroducing exactly the "whose sign
-- convention is this" ambiguity the spec called out by name (the same unresolved pattern
-- already flagged as an open item on the Xero actuals importer) instead of eliminating it at
-- the schema level. Fixing before any more UI gets built on top of the signed convention.
--
-- Backfill first (2 existing test rows as of this migration), then flip amount_cents to
-- unsigned and require the indicator going forward -- not a grace period, matching this
-- codebase's usual "constraints from the first migration" posture, just arriving one migration
-- late here.

ALTER TABLE org_bank_statement_lines
  ADD COLUMN credit_debit_indicator text;

UPDATE org_bank_statement_lines
  SET credit_debit_indicator = CASE WHEN amount_cents < 0 THEN 'debit' ELSE 'credit' END,
      amount_cents = abs(amount_cents);

ALTER TABLE org_bank_statement_lines
  ALTER COLUMN credit_debit_indicator SET NOT NULL,
  ADD CONSTRAINT org_bank_statement_lines_credit_debit_indicator_check
    CHECK (credit_debit_indicator = ANY (ARRAY['credit'::text, 'debit'::text])),
  ADD CONSTRAINT org_bank_statement_lines_amount_non_negative
    CHECK (amount_cents >= 0);

COMMENT ON COLUMN org_bank_statement_lines.credit_debit_indicator IS
  'Which direction the amount moves from the org''s own perspective -- credit = money in, debit = money out. amount_cents is always non-negative; this column carries the direction instead of the sign, per spec Section 2.1.';

-- The dedup fingerprint (computeFingerprint in bankReconciliation.js) must include this column
-- going forward -- without it, a $50 debit and a $50 credit on the same account/date/description
-- would now collide (amount_cents alone no longer distinguishes them once it's unsigned). No
-- schema change needed for that -- import_fingerprint is already an opaque text column; this is
-- an app-code fix, made in the same pass as this migration.
