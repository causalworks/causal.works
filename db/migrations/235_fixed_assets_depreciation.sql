-- Fixed Assets & Depreciation (Accounting build order item 3, 2026-09-14 spec): a real
-- per-asset register feeding the ledger, replacing 990 Schedule D's current after-the-fact
-- computation (a hardcoded 1400-1499 account-code range + a name-string check for
-- "depreciation" against a balance-sheet snapshot -- no register, no reliable account
-- tagging). See .claude/plans/archive/2026-09-14-fixed-assets-depreciation-spec.md.

CREATE TABLE public.org_fixed_assets (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    description text,
    asset_account_id integer NOT NULL,
    accumulated_depreciation_account_id integer NOT NULL,
    depreciation_expense_account_id integer NOT NULL,
    acquisition_date date NOT NULL,
    cost_cents bigint NOT NULL,
    salvage_value_cents bigint NOT NULL DEFAULT 0,
    useful_life_months integer NOT NULL,
    status text NOT NULL DEFAULT 'active',
    disposal_date date,
    disposal_proceeds_cents bigint,
    program_id integer NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_fixed_assets_cost_positive CHECK (cost_cents > 0),
    CONSTRAINT org_fixed_assets_salvage_nonneg CHECK (salvage_value_cents >= 0),
    CONSTRAINT org_fixed_assets_salvage_lt_cost CHECK (salvage_value_cents < cost_cents),
    CONSTRAINT org_fixed_assets_useful_life_positive CHECK (useful_life_months > 0),
    CONSTRAINT org_fixed_assets_status_check CHECK (status IN ('active', 'fully_depreciated', 'disposed')),
    CONSTRAINT org_fixed_assets_disposal_consistency CHECK ((status = 'disposed') = (disposal_date IS NOT NULL))
);

CREATE SEQUENCE public.org_fixed_assets_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_fixed_assets_id_seq OWNED BY public.org_fixed_assets.id;
ALTER TABLE ONLY public.org_fixed_assets ALTER COLUMN id SET DEFAULT nextval('public.org_fixed_assets_id_seq'::regclass);
ALTER TABLE ONLY public.org_fixed_assets ADD CONSTRAINT org_fixed_assets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_asset_account_id_fkey FOREIGN KEY (asset_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_accum_depr_account_id_fkey FOREIGN KEY (accumulated_depreciation_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_depr_expense_account_id_fkey FOREIGN KEY (depreciation_expense_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_program_id_fkey FOREIGN KEY (program_id) REFERENCES public.org_programs(id);
ALTER TABLE ONLY public.org_fixed_assets
    ADD CONSTRAINT org_fixed_assets_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

CREATE INDEX idx_org_fixed_assets_org_status ON public.org_fixed_assets USING btree (org_id, status);

ALTER TABLE public.org_fixed_assets OWNER TO postgres;
ALTER TABLE public.org_fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_fixed_assets FORCE ROW LEVEL SECURITY;
CREATE POLICY org_fixed_assets_org_isolation ON public.org_fixed_assets
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_fixed_assets IS
  'Per-asset fixed asset register: cost basis, acquisition date, useful life. Straight-line depreciation only. Feeds Schedule D and org_fixed_asset_depreciation_entries -- replaces the old balance-sheet-snapshot-guessing Schedule D used before this register existed.';

-- One row per asset per posted depreciation period -- the register's own audit trail,
-- distinct from (but linked to) the ledger transaction it produced. Makes "Run
-- depreciation" safely idempotent: a period already posted for an asset is a no-op on
-- re-run, enforced by the unique constraint below, not just application-level care.
CREATE TABLE public.org_fixed_asset_depreciation_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    fixed_asset_id integer NOT NULL,
    period_date date NOT NULL,
    amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_fixed_asset_depr_entries_amount_positive CHECK (amount_cents > 0)
);

CREATE SEQUENCE public.org_fixed_asset_depreciation_entries_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_fixed_asset_depreciation_entries_id_seq OWNED BY public.org_fixed_asset_depreciation_entries.id;
ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries ALTER COLUMN id SET DEFAULT nextval('public.org_fixed_asset_depreciation_entries_id_seq'::regclass);
ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries ADD CONSTRAINT org_fixed_asset_depreciation_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_unique UNIQUE (fixed_asset_id, period_date);

ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_asset_id_fkey FOREIGN KEY (fixed_asset_id) REFERENCES public.org_fixed_assets(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_fixed_asset_depreciation_entries
    ADD CONSTRAINT org_fixed_asset_depr_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);

CREATE INDEX idx_org_fixed_asset_depr_entries_org_asset ON public.org_fixed_asset_depreciation_entries USING btree (org_id, fixed_asset_id);

ALTER TABLE public.org_fixed_asset_depreciation_entries OWNER TO postgres;
ALTER TABLE public.org_fixed_asset_depreciation_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_fixed_asset_depreciation_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY org_fixed_asset_depr_entries_org_isolation ON public.org_fixed_asset_depreciation_entries
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_fixed_asset_depreciation_entries IS
  'One row per (fixed_asset_id, period_date) that has already been posted -- the unique constraint is what makes Run Depreciation idempotent, not just application-level care.';

-- New ledger transaction source for depreciation postings, alongside the existing manual/
-- bank_reconciliation/bill_approval/invoice/bill_payment/invoice_payment values.
ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text]));
