-- Indirect cost rate (Accounting build-order item #6, part 3). Reviewed first: org_grants
-- already carries the SEFA/990 federal-award columns (is_federal_award, federal_awarding_agency,
-- aln, pass-through fields) but no NICRA/de-minimis/MTDC column exists anywhere in the codebase
-- -- this is genuinely greenfield, not unfinished cruft. The existing "Indirect Costs" tab
-- (org_allocation_schedules/org_allocation_lines) is a separate cost-allocation-methodology tool
-- that spreads a manually-entered fixed pool by percent/amount; it is not extended here and
-- stays independent of the rate x base computation below.

CREATE TYPE public.org_indirect_cost_rate_type AS ENUM ('none', 'de_minimis', 'negotiated');
CREATE TYPE public.org_indirect_cost_base AS ENUM ('mtdc', 'total_direct_costs', 'salaries_wages');

ALTER TABLE public.org_grants
  ADD COLUMN indirect_cost_rate_type public.org_indirect_cost_rate_type NOT NULL DEFAULT 'none',
  ADD COLUMN indirect_cost_rate_bps integer,
  ADD COLUMN indirect_cost_base public.org_indirect_cost_base NOT NULL DEFAULT 'mtdc',
  ADD COLUMN nicra_expiration_date date,
  ADD COLUMN nicra_document_id integer;

ALTER TABLE public.org_grants
  ADD CONSTRAINT org_grants_indirect_cost_rate_bps_check
    CHECK (
      (indirect_cost_rate_type = 'none' AND indirect_cost_rate_bps IS NULL)
      OR (indirect_cost_rate_type = 'de_minimis' AND indirect_cost_rate_bps IN (1000, 1500))
      OR (indirect_cost_rate_type = 'negotiated' AND indirect_cost_rate_bps > 0 AND indirect_cost_rate_bps <= 10000)
    );
ALTER TABLE public.org_grants
  ADD CONSTRAINT org_grants_nicra_document_id_fkey
    FOREIGN KEY (nicra_document_id) REFERENCES public.org_documents(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_grants.indirect_cost_rate_bps IS
  'De minimis is 1500 bps (15% of MTDC) for awards under the Oct 2024 Uniform Guidance revision, or 1000 bps (10%) for older awards that elected under the pre-revision rate -- both allowed values kept since an org can hold awards from either era. Negotiated (NICRA) rates are org-specific and unconstrained beyond a 100% sanity ceiling.';
COMMENT ON COLUMN public.org_grants.indirect_cost_base IS
  'MTDC (modified total direct costs) is the federal default base. Kept editable per grant, not hardcoded to MTDC, since a pre-2 CFR 200 legacy award or a private (non-federal) funder can specify a different base.';

-- MTDC by definition excludes capital equipment, tuition remission, and the portion of each
-- subaward beyond $25,000 -- rather than guessing this from account names or types, follow the
-- exact is_non_cash convention (migration 233): an explicit per-account flag, set once by the
-- org, never inferred.
ALTER TABLE public.org_accounts
  ADD COLUMN is_mtdc_excluded boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.org_accounts.is_mtdc_excluded IS
  'True for direct-cost expense accounts that Modified Total Direct Costs excludes per 2 CFR 200.1 (capital equipment, tuition remission, the subaward portion beyond $25,000, etc.). Set explicitly per org/account -- do not infer from account name or type, same discipline as is_non_cash.';

-- One row per (grant_id, fiscal_year, period_label) recovery run already posted -- mirrors
-- org_fixed_asset_depreciation_entries'' idempotency pattern for "Run Indirect Cost Recovery."
CREATE TABLE public.org_indirect_cost_recovery_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    grant_id integer NOT NULL,
    period_start_date date NOT NULL,
    period_end_date date NOT NULL,
    mtdc_base_cents bigint NOT NULL,
    rate_bps integer NOT NULL,
    recovery_amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    posted_by_user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_indirect_cost_recovery_entries_base_nonneg CHECK (mtdc_base_cents >= 0),
    CONSTRAINT org_indirect_cost_recovery_entries_amount_nonneg CHECK (recovery_amount_cents >= 0),
    CONSTRAINT org_indirect_cost_recovery_entries_period_order CHECK (period_end_date >= period_start_date)
);

CREATE SEQUENCE public.org_indirect_cost_recovery_entries_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_indirect_cost_recovery_entries_id_seq OWNED BY public.org_indirect_cost_recovery_entries.id;
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries ALTER COLUMN id SET DEFAULT nextval('public.org_indirect_cost_recovery_entries_id_seq'::regclass);
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries ADD CONSTRAINT org_indirect_cost_recovery_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_unique UNIQUE (grant_id, period_start_date, period_end_date);

ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_grant_id_fkey FOREIGN KEY (grant_id) REFERENCES public.org_grants(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);
ALTER TABLE ONLY public.org_indirect_cost_recovery_entries
    ADD CONSTRAINT org_indirect_cost_recovery_entries_posted_by_fkey FOREIGN KEY (posted_by_user_id) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_org_indirect_cost_recovery_entries_org_grant ON public.org_indirect_cost_recovery_entries (org_id, grant_id);

ALTER TABLE public.org_indirect_cost_recovery_entries OWNER TO postgres;
ALTER TABLE public.org_indirect_cost_recovery_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_indirect_cost_recovery_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY org_indirect_cost_recovery_entries_org_isolation ON public.org_indirect_cost_recovery_entries
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

-- 'indirect_cost_recovery' ledger source already added to org_ledger_transactions_source_check
-- by migration 247 (all four new source values were added together there).
