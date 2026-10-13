-- A sponsored-project disbursement becomes a ledger entry only when Accounting posts it; the entry's source is
-- 'sponsored_disbursement'.
ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check CHECK (source = ANY (ARRAY[
  'manual','bank_reconciliation','bill_approval','invoice','bill_payment','invoice_payment','fixed_asset_depreciation','fixed_asset_disposal',
  'expense_claim_approval','expense_claim_payment','recode','gift_in_kind','pledge_commitment','pledge_accretion','indirect_cost_recovery','gift_reclassify',
  'sponsored_disbursement']::text[]));
