-- 246: adds 'recode' to org_ledger_transactions_source_check, for the Find & Recode v2
-- correcting-journal path (server/organizational/lib/findAndRecode.js). Posted ledger lines
-- are never edited in place -- matching this codebase's existing bill/invoice edit-lock rule,
-- and Xero's own "recode with a manual journal" mode for already-reported transactions
-- (researched 2026-09-16, not guessed) -- a recode instead posts a new balanced journal that
-- reverses the old coding and re-applies the new one, leaving the original transaction and its
-- lines completely untouched.

ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text, 'recode'::text]));
