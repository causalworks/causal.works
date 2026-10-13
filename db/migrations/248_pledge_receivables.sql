-- Multi-year pledges (Accounting build-order item #6, part 2). Today gift_type = 'pledge' on
-- org_gifts is just a label -- a promised-but-uncollected pledge is stored identically to cash
-- already in hand (same amount_cents/received_at fields, no receivable, no schedule, no
-- present-value discounting for multi-year promises). This adds the real receivable/commitment
-- mechanics per ASC 958-605: an unconditional pledge is recognized as a receivable + revenue at
-- commitment (present-valued if multi-year), collected later via ordinary Cash Coding against the
-- receivable account (no new posting path needed for collections -- see spec doc).

ALTER TABLE public.org_gifts
  ADD COLUMN total_pledged_cents bigint,
  ADD COLUMN is_multi_year_pledge boolean NOT NULL DEFAULT false,
  ADD COLUMN discount_rate_bps integer,
  ADD COLUMN discounted_present_value_cents bigint,
  ADD COLUMN receivable_account_id integer;

ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_total_pledged_nonneg
    CHECK (total_pledged_cents IS NULL OR total_pledged_cents >= 0);
ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_discount_rate_bps_range
    CHECK (discount_rate_bps IS NULL OR (discount_rate_bps >= 0 AND discount_rate_bps <= 5000));
ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_receivable_account_id_fkey
    FOREIGN KEY (receivable_account_id) REFERENCES public.org_accounts(id);

COMMENT ON COLUMN public.org_gifts.total_pledged_cents IS
  'Face value of the promise for gift_type = pledge. amount_cents holds the amount actually posted at commitment (= discounted_present_value_cents if is_multi_year_pledge, else total_pledged_cents) -- kept distinct so the discount is always visible, not silently absorbed into amount_cents.';
COMMENT ON COLUMN public.org_gifts.discount_rate_bps IS
  'Fixed at pledge commitment per ASC 958-605 (does not float with the pledge''s remaining term). Only meaningful when is_multi_year_pledge.';

-- Tracking-only: what's due and when. Not itself a posting source -- collections post as
-- ordinary bank deposits coded against receivable_account_id in Cash Coding/Reconcile: this
-- table just lets Donors/Accounting see what's expected vs. collected without a new mechanism.
CREATE TABLE public.org_gift_pledge_installments (
    id integer NOT NULL,
    org_id integer NOT NULL,
    gift_id integer NOT NULL,
    due_date date NOT NULL,
    amount_cents bigint NOT NULL,
    status text NOT NULL DEFAULT 'expected',
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_gift_pledge_installments_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT org_gift_pledge_installments_status_check CHECK (status IN ('expected', 'collected', 'written_off'))
);

CREATE SEQUENCE public.org_gift_pledge_installments_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_gift_pledge_installments_id_seq OWNED BY public.org_gift_pledge_installments.id;
ALTER TABLE ONLY public.org_gift_pledge_installments ALTER COLUMN id SET DEFAULT nextval('public.org_gift_pledge_installments_id_seq'::regclass);
ALTER TABLE ONLY public.org_gift_pledge_installments ADD CONSTRAINT org_gift_pledge_installments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_gift_pledge_installments
    ADD CONSTRAINT org_gift_pledge_installments_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_gift_pledge_installments
    ADD CONSTRAINT org_gift_pledge_installments_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.org_gifts(id) ON DELETE CASCADE;

CREATE INDEX idx_org_gift_pledge_installments_gift ON public.org_gift_pledge_installments (gift_id);
CREATE INDEX idx_org_gift_pledge_installments_org_due ON public.org_gift_pledge_installments (org_id, due_date) WHERE status = 'expected';

ALTER TABLE public.org_gift_pledge_installments OWNER TO postgres;
ALTER TABLE public.org_gift_pledge_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_gift_pledge_installments FORCE ROW LEVEL SECURITY;
CREATE POLICY org_gift_pledge_installments_org_isolation ON public.org_gift_pledge_installments
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

-- Periodic discount accretion for multi-year pledges, mirroring
-- org_fixed_asset_depreciation_entries: one row per (gift_id, period_date) already posted, the
-- unique constraint is what makes "Run Pledge Accretion" idempotent.
CREATE TABLE public.org_pledge_accretion_entries (
    id integer NOT NULL,
    org_id integer NOT NULL,
    gift_id integer NOT NULL,
    period_date date NOT NULL,
    amount_cents bigint NOT NULL,
    ledger_transaction_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_pledge_accretion_entries_amount_positive CHECK (amount_cents > 0)
);

CREATE SEQUENCE public.org_pledge_accretion_entries_id_seq AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_pledge_accretion_entries_id_seq OWNED BY public.org_pledge_accretion_entries.id;
ALTER TABLE ONLY public.org_pledge_accretion_entries ALTER COLUMN id SET DEFAULT nextval('public.org_pledge_accretion_entries_id_seq'::regclass);
ALTER TABLE ONLY public.org_pledge_accretion_entries ADD CONSTRAINT org_pledge_accretion_entries_pkey PRIMARY KEY (id);
ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_unique UNIQUE (gift_id, period_date);

ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_gift_id_fkey FOREIGN KEY (gift_id) REFERENCES public.org_gifts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_pledge_accretion_entries
    ADD CONSTRAINT org_pledge_accretion_entries_txn_id_fkey FOREIGN KEY (ledger_transaction_id) REFERENCES public.org_ledger_transactions(id);

CREATE INDEX idx_org_pledge_accretion_entries_org_gift ON public.org_pledge_accretion_entries (org_id, gift_id);

ALTER TABLE public.org_pledge_accretion_entries OWNER TO postgres;
ALTER TABLE public.org_pledge_accretion_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_pledge_accretion_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY org_pledge_accretion_entries_org_isolation ON public.org_pledge_accretion_entries
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));
