-- Expense Claims (Accounting build order item 4/5, 2026-09-14 spec + addendum):
-- staff/board reimbursement, deliberately NOT built on org_bills -- submitter identity,
-- 1099-exemption under IRS Pub. 463, and self-approval risk on payments to insiders all
-- differ in kind from an arm's-length vendor bill. See
-- .claude/plans/2026-09-14-expense-claims-spec.md for the full reasoning, including the
-- addendum covering receipt OCR prefill and the configurable pre-approval/post-payout
-- approval timing.

-- New document category, following the exact precedent of vendor_bill/customer_invoice/
-- procurement_quote/sponsee_report -- each major financial-document-producing feature
-- gets its own category rather than falling into 'other'.
ALTER TYPE public.org_document_category ADD VALUE IF NOT EXISTS 'expense_receipt';

-- Own liability account, not the vendor AP account -- a balance sheet reader (or an
-- auditor doing related-party review) should be able to see money owed to insiders
-- separately from money owed to arm's-length vendors. Same pattern as
-- is_system_ap_account/is_system_ar_account/is_system_clearing_account.
ALTER TABLE public.org_accounts
  ADD COLUMN is_system_expense_claims_payable_account boolean DEFAULT false NOT NULL;

CREATE UNIQUE INDEX idx_org_accounts_one_expense_claims_payable_per_org
  ON public.org_accounts (org_id) WHERE is_system_expense_claims_payable_account;

-- Auto-provisioning, modeled directly on org_get_or_create_ap_account() -- same
-- find-or-create-with-a-free-code pattern, distinct code range (2050+) so it never
-- collides with AP's own 2000-2020 range.
CREATE FUNCTION public.org_get_or_create_expense_claims_payable_account(p_org_id integer) RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_id integer;
  v_candidate_code text;
  v_offset integer := 0;
BEGIN
  SELECT id INTO v_id FROM org_accounts
    WHERE org_id = p_org_id AND is_system_expense_claims_payable_account = true
    LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  LOOP
    v_candidate_code := (2050 + v_offset)::text;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM org_accounts WHERE org_id = p_org_id AND code = v_candidate_code
    );
    v_offset := v_offset + 1;
    IF v_offset > 20 THEN
      RAISE EXCEPTION 'Could not find a free account code for org %''s Expense Claims Payable account (checked 2050-2070)', p_org_id
        USING ERRCODE = 'CA006';
    END IF;
  END LOOP;

  INSERT INTO org_accounts (org_id, code, name, type, level, is_posting, is_system_expense_claims_payable_account)
  VALUES (p_org_id, v_candidate_code, 'Expense Claims Payable', 'liability', 3, true, true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Per-org choice of when the human control step happens relative to payment. Defaults to
-- the stronger option (approval before money moves) -- an org must explicitly opt into
-- post-payout confirmation, it is never silently the behavior.
ALTER TABLE public.org_settings
  ADD COLUMN expense_claim_approval_mode text DEFAULT 'pre_approval'::text NOT NULL;
ALTER TABLE public.org_settings
  ADD CONSTRAINT org_settings_expense_claim_approval_mode_check
  CHECK (expense_claim_approval_mode IN ('pre_approval', 'post_payout'));

COMMENT ON COLUMN public.org_settings.expense_claim_approval_mode IS
  'pre_approval (default, stronger): a non-submitter must approve before payment posts. post_payout: submission posts payment immediately and a non-submitter confirms afterward -- for small orgs where pre-payment board approval is impractically slow. The self-review rule (approver/confirmer != submitter) is enforced at the DB trigger level in both modes.';

-- New source values for expense-claim postings.
ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text]));

CREATE TABLE public.org_expense_claims (
    id integer NOT NULL,
    org_id integer NOT NULL,
    submitted_by integer NOT NULL,
    claim_date date NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'draft',
    approved_by integer,
    approved_at timestamp with time zone,
    confirmed_by integer,
    confirmed_at timestamp with time zone,
    disputed_reason text,
    ledger_transaction_id integer,
    payment_ledger_transaction_id integer,
    bank_account_id integer,
    fiscal_year integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_expense_claims_status_check CHECK (status IN ('draft', 'pending_approval', 'approved', 'paid_pending_confirmation', 'paid', 'confirmed', 'disputed', 'void')),
    CONSTRAINT org_expense_claims_fy_reasonable CHECK (fiscal_year >= 1900 AND fiscal_year <= 2200)
);

CREATE SEQUENCE public.org_expense_claims_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_expense_claims_id_seq OWNED BY public.org_expense_claims.id;
ALTER TABLE ONLY public.org_expense_claims ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claims_id_seq'::regclass);
ALTER TABLE ONLY public.org_expense_claims ADD CONSTRAINT org_expense_claims_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.users(id);
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_confirmed_by_fkey FOREIGN KEY (confirmed_by) REFERENCES public.users(id);
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_payment_ledger_transaction_id_fkey FOREIGN KEY (payment_ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);
ALTER TABLE ONLY public.org_expense_claims
    ADD CONSTRAINT org_expense_claims_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);

CREATE INDEX idx_org_expense_claims_org_status ON public.org_expense_claims USING btree (org_id, status);
CREATE INDEX idx_org_expense_claims_org_submitter ON public.org_expense_claims USING btree (org_id, submitted_by);

ALTER TABLE public.org_expense_claims OWNER TO postgres;
ALTER TABLE public.org_expense_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_expense_claims FORCE ROW LEVEL SECURITY;
CREATE POLICY org_expense_claims_org_isolation ON public.org_expense_claims
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_expense_claims IS
  'Staff/board reimbursement claims. Deliberately separate from org_bills -- submitted_by is the actual claimant (not just an audit field), never touches 1099 tracking, and self-review is blocked unconditionally (not just for federal awards, unlike org_bills own trigger). Two status flows depending on org_settings.expense_claim_approval_mode: pre_approval (draft/pending_approval/approved/paid) or post_payout (draft/paid_pending_confirmation/confirmed or disputed).';

-- Separation of duties, unconditional (stricter than org_bills' own federal-award-only
-- version) -- applies to BOTH approved_by (pre_approval mode) and confirmed_by
-- (post_payout mode), since the control is "money never moves to or is signed off by the
-- person who requested it," invariant across which mode an org uses.
CREATE FUNCTION public.org_enforce_expense_claim_no_self_review() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'org_expense_claims % cannot be approved by its own submitter (submitted_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA009';
  END IF;
  IF NEW.confirmed_by IS NOT NULL AND NEW.confirmed_by = NEW.submitted_by THEN
    RAISE EXCEPTION 'org_expense_claims % cannot be confirmed by its own submitter (submitted_by = confirmed_by = %)', NEW.id, NEW.confirmed_by
      USING ERRCODE = 'CA009';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expense_claims_no_self_review
  BEFORE UPDATE OF approved_by, confirmed_by ON public.org_expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.org_enforce_expense_claim_no_self_review();

CREATE TRIGGER trg_fy_lock_expense_claims
  BEFORE INSERT OR DELETE OR UPDATE ON public.org_expense_claims
  FOR EACH ROW EXECUTE FUNCTION public.org_enforce_fiscal_year_lock();

CREATE TABLE public.org_expense_claim_lines (
    id integer NOT NULL,
    claim_id integer NOT NULL,
    account_id integer NOT NULL,
    program_id integer NOT NULL,
    grant_id integer,
    expense_date date NOT NULL,
    description text NOT NULL,
    miles numeric(8,1),
    rate_cents_per_mile integer,
    amount_cents bigint NOT NULL,
    line_memo text,
    CONSTRAINT org_expense_claim_lines_amount_positive CHECK (amount_cents > 0)
);

CREATE SEQUENCE public.org_expense_claim_lines_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_expense_claim_lines_id_seq OWNED BY public.org_expense_claim_lines.id;
ALTER TABLE ONLY public.org_expense_claim_lines ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claim_lines_id_seq'::regclass);
ALTER TABLE ONLY public.org_expense_claim_lines ADD CONSTRAINT org_expense_claim_lines_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.org_expense_claims(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);
ALTER TABLE ONLY public.org_expense_claim_lines
    ADD CONSTRAINT org_expense_claim_lines_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id);

CREATE INDEX idx_org_expense_claim_lines_claim ON public.org_expense_claim_lines USING btree (claim_id);

ALTER TABLE public.org_expense_claim_lines OWNER TO postgres;
ALTER TABLE public.org_expense_claim_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_expense_claim_lines FORCE ROW LEVEL SECURITY;
-- No org_id column here (same denormalization choice org_bill_lines already makes) --
-- exact policy shape org_bill_lines already uses, confirmed by reading it directly.
CREATE POLICY org_expense_claim_lines_org_isolation ON public.org_expense_claim_lines
  USING (EXISTS (SELECT 1 FROM public.org_expense_claims c WHERE c.id = org_expense_claim_lines.claim_id
    AND c.org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_expense_claim_lines IS
  'Line items for an expense claim. Mileage is first-class (miles/rate_cents_per_mile are optional metadata; amount_cents is always the number that actually posts, computed client-side from miles*rate when present).';

CREATE TABLE public.org_expense_claim_payments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    claim_id integer NOT NULL,
    payment_date date NOT NULL,
    amount_cents bigint NOT NULL,
    bank_account_id integer NOT NULL,
    ledger_transaction_id integer NOT NULL,
    status text NOT NULL DEFAULT 'posted',
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_expense_claim_payments_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT org_expense_claim_payments_status_check CHECK (status IN ('posted', 'voided'))
);

CREATE SEQUENCE public.org_expense_claim_payments_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_expense_claim_payments_id_seq OWNED BY public.org_expense_claim_payments.id;
ALTER TABLE ONLY public.org_expense_claim_payments ALTER COLUMN id SET DEFAULT nextval('public.org_expense_claim_payments_id_seq'::regclass);
ALTER TABLE ONLY public.org_expense_claim_payments ADD CONSTRAINT org_expense_claim_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_claim_id_fkey FOREIGN KEY (claim_id) REFERENCES public.org_expense_claims(id);
ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_ledger_transaction_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);
ALTER TABLE ONLY public.org_expense_claim_payments
    ADD CONSTRAINT org_expense_claim_payments_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

CREATE INDEX idx_org_expense_claim_payments_org_claim ON public.org_expense_claim_payments USING btree (org_id, claim_id);

ALTER TABLE public.org_expense_claim_payments OWNER TO postgres;
ALTER TABLE public.org_expense_claim_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_expense_claim_payments FORCE ROW LEVEL SECURITY;
CREATE POLICY org_expense_claim_payments_org_isolation ON public.org_expense_claim_payments
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_expense_claim_payments IS
  'Payment record for a pre_approval-mode claim (the separate pay-after-approve step). post_payout-mode claims post their payment leg directly as part of submission and do not use this table -- see org_expense_claims.payment_ledger_transaction_id instead.';
