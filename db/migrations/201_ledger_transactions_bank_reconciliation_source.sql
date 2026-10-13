-- 201: Bank Reconciliation V1, Step 3 -- org_ledger_transactions.source's comment (migration 191)
-- said 'manual' today, "future-proofs for later import paths"; a transaction created by coding
-- a bank statement line is exactly that later path, and giving it real provenance (distinct
-- from a hand-typed manual entry) costs one CHECK constraint value, not new posting logic --
-- the actual posting/balance/lock/cross-org enforcement is unchanged, this only labels who
-- called it.

ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text]));
