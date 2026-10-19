-- Membership accounting: how each posted dues payment or refund was split (contribution, deferred, revenue) and where it
-- was deposited, the monthly recognition rows (deferred dues moved to revenue, posted only when a person confirms the
-- run), and the ledger source membership_dues.

BEGIN;

ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS posted_contribution_cents integer;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS posted_deferred_cents integer;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS posted_revenue_cents integer;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS deposit_account_id integer REFERENCES org_accounts(id);
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS posted_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS posted_at timestamptz;

CREATE TABLE IF NOT EXISTS org_membership_recognition (
  id                     serial PRIMARY KEY,
  org_id                 integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  term_id                integer NOT NULL REFERENCES org_membership_terms(id) ON DELETE CASCADE,
  month                  date NOT NULL CHECK (month = date_trunc('month', month)::date),
  amount_cents           integer NOT NULL,
  ledger_transaction_id  integer REFERENCES org_ledger_transactions(id),
  posted_by              integer REFERENCES users(id) ON DELETE SET NULL,
  posted_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, month)
);
CREATE INDEX IF NOT EXISTS org_membership_recognition_month_idx ON org_membership_recognition (org_id, month);
ALTER TABLE org_membership_recognition ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_recognition FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_recognition_org_isolation ON org_membership_recognition;
CREATE POLICY org_membership_recognition_org_isolation ON org_membership_recognition
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, DELETE ON org_membership_recognition TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_recognition_id_seq TO causal_app;

DO $$
DECLARE
  def text;
  vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'org_ledger_transactions_source_check' AND c.conrelid = 'org_ledger_transactions'::regclass;
  IF def IS NULL THEN
    RAISE EXCEPTION 'org_ledger_transactions_source_check not found';
  END IF;
  SELECT array_agg(m[1]) INTO vals FROM regexp_matches(def, '''([a-z_]+)''', 'g') AS m;
  IF NOT ('membership_dues' = ANY (vals)) THEN
    vals := vals || 'membership_dues'::text;
    ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
    EXECUTE format('ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check CHECK (source = ANY (%L::text[]))', vals);
  END IF;
END $$;

COMMIT;
