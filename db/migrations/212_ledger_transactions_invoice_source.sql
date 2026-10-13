-- 212: caught before testing, not after. invoices.js was about to post every Sent/write-off
-- transaction with source='bill_approval' (the only non-manual, non-bank-reconciliation value
-- the CHECK allowed) -- mislabeling every invoice-originated transaction as if it came from a
-- Bill. Adds a real 'invoice' source value instead of reusing the wrong one.

ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text]));
