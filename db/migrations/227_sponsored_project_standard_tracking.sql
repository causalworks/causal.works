-- Standard (pass-through) fiscal sponsorship tracking. Confirmed via external research
-- before writing this (established fiscal-sponsor accounting guidance -- see
-- .claude/plans/2026-09-14-fiscal-sponsorship-core-compliance.md) that Standard/Model C
-- sponsorship should track revenue received and the net amount disbursed to the sponsee
-- (minus the admin fee retained), NOT the sponsee's own itemized expenses -- those stay in
-- the sponsee's own books, and the sponsor keeps their reports as documentation
-- (org_documents.sponsored_project_id, migration 226), not as ledger detail.
--
-- Revenue side: link org_gifts to the sponsored project it's designated for, rather than a
-- separately-entered total that could drift from what Donors already has recorded. A gift
-- designated to a sponsored project is still real revenue the sponsor received (and still
-- receipts on the sponsor's own EIN, per Tier 2 item 7) -- this just lets it also be
-- attributed to a specific project for Standard-tracking purposes.
ALTER TABLE public.org_gifts
  ADD COLUMN sponsored_project_id integer;

ALTER TABLE public.org_gifts
  ADD CONSTRAINT org_gifts_sponsored_project_id_fkey
  FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE SET NULL;

CREATE INDEX idx_org_gifts_sponsored_project ON public.org_gifts (sponsored_project_id)
  WHERE sponsored_project_id IS NOT NULL;

-- Disbursement side: a simple log of payout events to the sponsee, net of the admin fee
-- retained on that payout. This is tracking/reporting only, per this pass's scope -- NOT
-- yet routed through the ledger or gated by an approval step. The approval gate for these
-- disbursements (the actual compliance-critical piece, per variance power) is still a
-- separate, later pass -- see the plan file's Phase 3.
CREATE TABLE public.org_sponsored_project_disbursements (
    id integer NOT NULL,
    org_id integer NOT NULL,
    sponsored_project_id integer NOT NULL,
    disbursement_date date NOT NULL,
    amount_cents bigint NOT NULL,
    admin_fee_cents bigint,
    notes text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_sponsored_project_disbursements_amount_cents_check CHECK (amount_cents > 0),
    CONSTRAINT org_sponsored_project_disbursements_admin_fee_cents_check CHECK (admin_fee_cents IS NULL OR admin_fee_cents >= 0)
);

CREATE SEQUENCE public.org_sponsored_project_disbursements_id_seq
    AS integer START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
ALTER SEQUENCE public.org_sponsored_project_disbursements_id_seq OWNED BY public.org_sponsored_project_disbursements.id;
ALTER TABLE ONLY public.org_sponsored_project_disbursements
  ALTER COLUMN id SET DEFAULT nextval('public.org_sponsored_project_disbursements_id_seq'::regclass);

ALTER TABLE ONLY public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_project_id_fkey
  FOREIGN KEY (sponsored_project_id) REFERENCES public.org_sponsored_projects(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX idx_org_sponsored_project_disbursements_project
  ON public.org_sponsored_project_disbursements (org_id, sponsored_project_id);

ALTER TABLE public.org_sponsored_project_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.org_sponsored_project_disbursements FORCE ROW LEVEL SECURITY;

CREATE POLICY org_sponsored_project_disbursements_org_isolation ON public.org_sponsored_project_disbursements
  USING ((org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer));
