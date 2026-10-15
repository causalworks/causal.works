ALTER TABLE public.org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE public.org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text, 'invoice'::text, 'bill_payment'::text, 'invoice_payment'::text, 'fixed_asset_depreciation'::text, 'fixed_asset_disposal'::text, 'expense_claim_approval'::text, 'expense_claim_payment'::text, 'recode'::text, 'gift_in_kind'::text, 'pledge_commitment'::text, 'pledge_accretion'::text, 'indirect_cost_recovery'::text, 'gift_reclassify'::text, 'sponsored_disbursement'::text, 'conversion_balance'::text])));

CREATE TABLE IF NOT EXISTS org_conversion_balances (
  id                    serial PRIMARY KEY,
  org_id                integer NOT NULL UNIQUE REFERENCES coop_members(id) ON DELETE CASCADE,
  conversion_date       date NOT NULL,
  program_id            integer REFERENCES org_programs(id),
  balancing_account_id  integer REFERENCES org_accounts(id),
  ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  status                text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  entered_by            integer REFERENCES users(id) ON DELETE SET NULL,
  locked_by             integer REFERENCES users(id) ON DELETE SET NULL,
  locked_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE org_conversion_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_conversion_balances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_conversion_balances_org_isolation ON org_conversion_balances;
CREATE POLICY org_conversion_balances_org_isolation ON org_conversion_balances
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_conversion_balances TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_conversion_balances_id_seq TO causal_app;
