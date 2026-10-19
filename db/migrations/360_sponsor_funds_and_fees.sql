-- Sponsorship: workspace settings, project fee rules, posted fee periods, gift flags for project funds.

-- Settings (one row per workspace)
CREATE TABLE IF NOT EXISTS org_sponsor_settings (
  org_id                          integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
  default_fee_minimum_cents       bigint NOT NULL DEFAULT 0 CHECK (default_fee_minimum_cents >= 0),
  second_approval_threshold_cents bigint NOT NULL DEFAULT 500000 CHECK (second_approval_threshold_cents >= 0),
  overdue_report_hold_days        integer NOT NULL DEFAULT 30 CHECK (overdue_report_hold_days >= 0),
  donor_letter_threshold_cents    bigint NOT NULL DEFAULT 500000 CHECK (donor_letter_threshold_cents >= 0),
  information_return_thresholds   jsonb NOT NULL DEFAULT '{"2026": 200000}'::jsonb,
  statement_day_of_month          smallint NOT NULL DEFAULT 5 CHECK (statement_day_of_month BETWEEN 1 AND 28),
  fee_income_account_id           integer REFERENCES org_accounts(id) ON DELETE SET NULL,
  fee_income_program_id           integer REFERENCES org_programs(id) ON DELETE SET NULL,
  fee_expense_account_id          integer REFERENCES org_accounts(id) ON DELETE SET NULL,
  untagged_review_from            timestamptz NOT NULL DEFAULT now(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_sponsor_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_settings_org_isolation ON org_sponsor_settings;
CREATE POLICY org_sponsor_settings_org_isolation ON org_sponsor_settings
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_sponsor_settings TO causal_app;

-- Fee rules (one row per rule period; a signed agreement makes rows read-only and changes become amendments)
CREATE TABLE IF NOT EXISTS org_sponsor_fee_rules (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  kind                    text NOT NULL DEFAULT 'percent' CHECK (kind IN ('percent', 'flat', 'tiered')),
  rate                    numeric(7,4) CHECK (rate IS NULL OR rate >= 0),
  tiers                   jsonb,
  flat_cents              bigint CHECK (flat_cents IS NULL OR flat_cents >= 0),
  minimum_quarter_cents   bigint NOT NULL DEFAULT 0 CHECK (minimum_quarter_cents >= 0),
  effective_from          date NOT NULL,
  amendment_document_id   integer REFERENCES org_documents(id) ON DELETE SET NULL,
  amendment_reason        text,
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_sponsor_fee_rules_shape CHECK (
    (kind = 'percent' AND rate IS NOT NULL) OR
    (kind = 'flat' AND flat_cents IS NOT NULL) OR
    (kind = 'tiered' AND tiers IS NOT NULL AND jsonb_typeof(tiers) = 'array')),
  UNIQUE (sponsored_project_id, effective_from)
);
CREATE INDEX IF NOT EXISTS org_sponsor_fee_rules_project_idx ON org_sponsor_fee_rules (sponsored_project_id, effective_from);

ALTER TABLE org_sponsor_fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_fee_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_fee_rules_org_isolation ON org_sponsor_fee_rules;
CREATE POLICY org_sponsor_fee_rules_org_isolation ON org_sponsor_fee_rules
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_sponsor_fee_rules_program_scope ON org_sponsor_fee_rules;
CREATE POLICY org_sponsor_fee_rules_program_scope ON org_sponsor_fee_rules AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR EXISTS (
    SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())));
GRANT SELECT, INSERT, UPDATE ON org_sponsor_fee_rules TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_sponsor_fee_rules_id_seq TO causal_app;

-- Posted fee periods (each row is one fee entry in the ledger for a project and quarter)
CREATE TABLE IF NOT EXISTS org_sponsor_fee_postings (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  period_start            date NOT NULL,
  period_end              date NOT NULL,
  amount_cents            bigint NOT NULL CHECK (amount_cents <> 0),
  ledger_transaction_id   integer REFERENCES org_ledger_transactions(id) ON DELETE SET NULL,
  voided_at               timestamptz,
  void_reason             text,
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_sponsor_fee_postings_project_idx ON org_sponsor_fee_postings (sponsored_project_id, period_end);

ALTER TABLE org_sponsor_fee_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_fee_postings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_fee_postings_org_isolation ON org_sponsor_fee_postings;
CREATE POLICY org_sponsor_fee_postings_org_isolation ON org_sponsor_fee_postings
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_sponsor_fee_postings_program_scope ON org_sponsor_fee_postings;
CREATE POLICY org_sponsor_fee_postings_program_scope ON org_sponsor_fee_postings AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR EXISTS (
    SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())));
GRANT SELECT, INSERT, UPDATE, DELETE ON org_sponsor_fee_postings TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_sponsor_fee_postings_id_seq TO causal_app;

-- Project and gift columns
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS agreement_signed_at date;

ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS sponsor_fee_exempt boolean NOT NULL DEFAULT false;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS sponsor_fee_exempt_reason text;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS sponsor_untagged_reviewed_at timestamptz;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS sponsor_untagged_reviewed_by integer;
CREATE INDEX IF NOT EXISTS org_gifts_sponsored_project_idx ON org_gifts (org_id, sponsored_project_id) WHERE sponsored_project_id IS NOT NULL;

-- Ledger source for fee entries (keeps every value already allowed)
CREATE OR REPLACE FUNCTION org_allow_ledger_source(p_source text) RETURNS void
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  def text;
  vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def
    FROM pg_constraint c
   WHERE c.conname = 'org_ledger_transactions_source_check' AND c.conrelid = 'org_ledger_transactions'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'org_ledger_transactions_source_check not found';
  END IF;
  SELECT array_agg(m[1]) INTO vals FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  IF vals IS NULL OR array_length(vals, 1) < 2 THEN
    RAISE EXCEPTION 'Could not read the allowed ledger sources from %', def;
  END IF;
  IF p_source = ANY (vals) THEN
    RETURN;
  END IF;
  vals := array_append(vals, p_source);
  ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
  EXECUTE 'ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check CHECK (source = ANY (ARRAY['
    || (SELECT string_agg(quote_literal(v) || '::text', ', ') FROM unnest(vals) AS v) || ']))';
END $$;
REVOKE ALL ON FUNCTION org_allow_ledger_source(text) FROM PUBLIC;

DO $$ BEGIN PERFORM org_allow_ledger_source('sponsor_fee'); END $$;

-- Starting fee rule for existing projects that carry a rate
INSERT INTO org_sponsor_fee_rules (org_id, sponsored_project_id, kind, rate, effective_from)
SELECT p.sponsor_org_id, p.id, 'percent', p.admin_rate, COALESCE(p.start_date, p.created_at::date)
  FROM org_sponsored_projects p
 WHERE p.admin_rate IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM org_sponsor_fee_rules r WHERE r.sponsored_project_id = p.id);

-- Settings row for workspaces already acting as fiscal sponsors
INSERT INTO org_sponsor_settings (org_id)
SELECT s.org_id FROM org_settings s WHERE s.fiscal_sponsorship_mode
ON CONFLICT (org_id) DO NOTHING;
