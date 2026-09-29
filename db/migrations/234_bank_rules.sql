-- Bank Rules (Accounting build order item 2, 2026-09-14 spec):
-- deterministic, org-defined coding rules for bank reconciliation, distinct from the
-- coding-memory auto-suggestion (which only offers the single most-recent manual coding
-- for a payee, on request). org_bank_statement_lines.coding_source has carried a CHECK
-- allowing 'rule' since migration 200/201 with nothing ever setting it -- this is the
-- first code path that does.
--
-- v1 scope: single-coding action (no splits), first-match-wins by priority, substring/
-- range conditions only (no regex, no OR logic). See
-- .claude/plans/2026-09-14-bank-rules-spec.md for full reasoning.

CREATE TABLE public.org_bank_rules (
    id integer NOT NULL,
    org_id integer NOT NULL,
    name text NOT NULL,
    priority integer NOT NULL DEFAULT 100,
    is_active boolean NOT NULL DEFAULT true,
    bank_account_id integer,
    payee_contains text,
    description_contains text,
    amount_min_cents bigint,
    amount_max_cents bigint,
    direction text,
    action_account_id integer NOT NULL,
    action_program_id integer NOT NULL,
    action_grant_id integer,
    action_donor_restriction_class org_restriction_class,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_bank_rules_needs_text_condition
      CHECK (payee_contains IS NOT NULL OR description_contains IS NOT NULL),
    CONSTRAINT org_bank_rules_amount_range
      CHECK (amount_min_cents IS NULL OR amount_max_cents IS NULL OR amount_min_cents <= amount_max_cents),
    CONSTRAINT org_bank_rules_direction_check
      CHECK (direction IS NULL OR direction IN ('debit', 'credit'))
);

CREATE SEQUENCE public.org_bank_rules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER SEQUENCE public.org_bank_rules_id_seq OWNED BY public.org_bank_rules.id;
ALTER TABLE ONLY public.org_bank_rules ALTER COLUMN id SET DEFAULT nextval('public.org_bank_rules_id_seq'::regclass);

ALTER TABLE ONLY public.org_bank_rules ADD CONSTRAINT org_bank_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_org_id_fkey FOREIGN KEY (org_id) REFERENCES public.coop_members(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_bank_account_id_fkey FOREIGN KEY (bank_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_account_id_fkey FOREIGN KEY (action_account_id) REFERENCES public.org_accounts(id);
ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_program_id_fkey FOREIGN KEY (action_program_id) REFERENCES public.org_programs(id);
ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_action_grant_id_fkey FOREIGN KEY (action_grant_id) REFERENCES public.org_grants(id);
ALTER TABLE ONLY public.org_bank_rules
    ADD CONSTRAINT org_bank_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);

CREATE INDEX idx_org_bank_rules_org_priority ON public.org_bank_rules USING btree (org_id, priority);

ALTER TABLE public.org_bank_rules OWNER TO postgres;
ALTER TABLE public.org_bank_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_bank_rules FORCE ROW LEVEL SECURITY;

CREATE POLICY org_bank_rules_org_isolation ON public.org_bank_rules
  USING ((org_id = (NULLIF(current_setting('app.current_org_id'::text, true), ''::text))::integer));

COMMENT ON TABLE public.org_bank_rules IS
  'Deterministic, org-defined coding rules for bank reconciliation. Evaluated first-match-wins by priority against unconfirmed org_bank_statement_lines; never posts automatically -- a matched rule only pre-fills the coding a human then confirms via the existing Create/Cash-Coding posting path.';

-- Traceability: which rule (if any) supplied a confirmed line's coding. Nullable, no
-- NOT NULL constraint added to an existing table, so no snapshot_demo_org() re-run is
-- required by the standard migration rule (verified: this ADD COLUMN has no default that
-- needs to survive jsonb_populate_recordset because it isn't NOT NULL at all).
ALTER TABLE public.org_bank_statement_lines
  ADD COLUMN applied_rule_id integer;

ALTER TABLE ONLY public.org_bank_statement_lines
  ADD CONSTRAINT org_bank_statement_lines_applied_rule_id_fkey
  FOREIGN KEY (applied_rule_id) REFERENCES public.org_bank_rules(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_bank_statement_lines.applied_rule_id IS
  'Which org_bank_rules row (if any) supplied this line''s coding when coding_source = ''rule''. NULL for manual codings, and set NULL on rule deletion (ON DELETE SET NULL) since the historical coding stays valid even if the rule that produced it is later removed.';
