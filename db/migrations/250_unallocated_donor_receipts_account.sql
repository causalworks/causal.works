-- Unallocated Donor Receipts suspense account (Grants↔Accounting ordering-3 refinement).
-- General accounting pattern (analogous to a standard "Undeposited Funds" clearing account), applied here by
-- analogy -- not a documented nonprofit-grant-specific best practice, see the research note in
-- CURRENT_PRIORITIES.md. When a deposit arrives and the bookkeeper doesn't yet know which grant
-- it belongs to, it can be coded here instead of guessed into a real revenue account. When the
-- grant is entered later in Donors and linked (POST .../gift-postings/:giftId/link-transaction),
-- the app posts a reclassifying entry (debit this account / credit the grant's real revenue
-- account) instead of leaving the money misclassified until someone remembers to fix it.

ALTER TABLE public.org_accounts
  ADD COLUMN is_system_unallocated_receipts_account boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_accounts.is_system_unallocated_receipts_account IS
  'At most one per org. A holding account for incoming cash not yet tied to a specific grant/gift record -- see server/organizational/lib/giftPosting.js''s link-transaction reclassify path. Excluded from Find & Recode targeting, same as the other system-account flags.';

CREATE UNIQUE INDEX idx_org_accounts_one_unalloc_receipts_account_per_org
  ON public.org_accounts (org_id) WHERE is_system_unallocated_receipts_account;

-- New ledger source for the reclassifying entry (debit suspense / credit the grant's real
-- revenue account) posted when a late-entered grant gift links to money already sitting in
-- the unallocated-receipts suspense account.
ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text, 'recode'::text, 'gift_in_kind'::text, 'pledge_commitment'::text, 'pledge_accretion'::text, 'indirect_cost_recovery'::text, 'gift_reclassify'::text]));
