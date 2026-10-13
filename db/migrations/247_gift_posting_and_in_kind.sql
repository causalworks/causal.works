-- In-kind gifts (Accounting build-order item #6, part 1). org_gifts (migration 096, Donor CRM)
-- has never posted to the ledger for any gift type -- reviewed and confirmed deliberate: cash
-- donations/grants/dues already reach the books via normal bank-deposit coding in Cash Coding/
-- Reconcile. In-kind gifts have no other way to ever reach the ledger, so this adds a real,
-- reviewed posting path for them specifically, following the same "land pending, post explicitly
-- within Accounting" posture as org_bank_statement_lines (never auto-post from the originating
-- module -- user's explicit architecture directive, 2026-09-16).

ALTER TABLE public.org_gifts
  ADD COLUMN posting_status text NOT NULL DEFAULT 'not_applicable',
  ADD COLUMN ledger_transaction_id integer,
  ADD COLUMN program_id integer,
  ADD COLUMN in_kind_description text,
  ADD COLUMN in_kind_valuation_method text,
  ADD COLUMN in_kind_fair_value_notes text,
  ADD COLUMN in_kind_revenue_account_id integer,
  ADD COLUMN in_kind_expense_account_id integer;

ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_posting_status_check
    CHECK (posting_status IN ('not_applicable', 'unposted', 'posted', 'void'));

ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_in_kind_valuation_method_check
    CHECK (in_kind_valuation_method IS NULL OR in_kind_valuation_method IN
      ('quoted_market_price', 'comparable_sales', 'cost_replacement', 'professional_appraisal', 'donor_stated', 'other'));

ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_ledger_transaction_id_fkey
    FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);
ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_program_id_fkey
    FOREIGN KEY (program_id) REFERENCES public.org_programs(id);
ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_in_kind_revenue_account_id_fkey
    FOREIGN KEY (in_kind_revenue_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_in_kind_expense_account_id_fkey
    FOREIGN KEY (in_kind_expense_account_id) REFERENCES public.org_accounts(id);

CREATE INDEX idx_org_gifts_posting_status ON public.org_gifts (org_id, posting_status)
  WHERE posting_status = 'unposted';

COMMENT ON COLUMN public.org_gifts.posting_status IS
  'not_applicable for cash donation/grant/dues gifts (never posted here -- reach the ledger via ordinary bank-deposit coding). unposted/posted/void only apply to in-kind gifts and pledge commitments, which have no other path to the ledger. Set to unposted at create time by donors.js; only server/organizational/routes/giftPostings.js moves it to posted/void, via postLedgerTransaction, mirroring org_bank_statement_lines'' unconfirmed/confirmed pattern.';
COMMENT ON COLUMN public.org_gifts.in_kind_valuation_method IS
  'Required for payment_method = in_kind. ASU 2020-07 requires nonprofits to disclose the valuation technique used to determine fair value for contributed nonfinancial assets.';

-- New ledger transaction sources for gift postings, alongside the existing set (including
-- 'recode', added by migration 246 for Find & Recode -- must be preserved here).
ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text, 'recode'::text, 'gift_in_kind'::text, 'pledge_commitment'::text, 'pledge_accretion'::text, 'indirect_cost_recovery'::text]));
