-- Online payments: per-workspace payment provider credentials (stored encrypted), the provider event log used to
-- ignore replayed webhooks, and the term fields that card checkout, subscriptions and failed payments need.

BEGIN;

CREATE TABLE IF NOT EXISTS org_payment_accounts (
  id                    serial PRIMARY KEY,
  org_id                integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  provider              text NOT NULL CHECK (provider IN ('stripe')),
  mode                  text NOT NULL CHECK (mode IN ('test', 'live')),
  account_ref           text,
  secret_enc            text,
  secret_iv             text,
  secret_tag            text,
  webhook_secret_enc    text,
  webhook_secret_iv     text,
  webhook_secret_tag    text,
  updated_by            integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, provider, mode)
);
ALTER TABLE org_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_payment_accounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_payment_accounts_org_isolation ON org_payment_accounts;
CREATE POLICY org_payment_accounts_org_isolation ON org_payment_accounts
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_payment_accounts TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_payment_accounts_id_seq TO causal_app;

CREATE TABLE IF NOT EXISTS payment_provider_events (
  id            bigserial PRIMARY KEY,
  provider      text NOT NULL,
  event_id      text NOT NULL,
  org_id        integer REFERENCES coop_members(id) ON DELETE SET NULL,
  event_type    text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  result        text,
  UNIQUE (provider, event_id)
);
GRANT SELECT, INSERT, UPDATE ON payment_provider_events TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE payment_provider_events_id_seq TO causal_app;

ALTER TABLE org_membership_settings ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'test';
ALTER TABLE org_membership_settings DROP CONSTRAINT IF EXISTS org_membership_settings_payment_mode_check;
ALTER TABLE org_membership_settings ADD CONSTRAINT org_membership_settings_payment_mode_check CHECK (payment_mode IN ('test', 'live'));
ALTER TABLE org_membership_settings ADD COLUMN IF NOT EXISTS card_payments_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE org_membership_settings ADD COLUMN IF NOT EXISTS monthly_instalments_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE org_membership_terms ADD COLUMN IF NOT EXISTS processor_customer_ref text;
ALTER TABLE org_membership_terms ADD COLUMN IF NOT EXISTS instalment_plan text;
ALTER TABLE org_membership_terms DROP CONSTRAINT IF EXISTS org_membership_terms_instalment_plan_check;
ALTER TABLE org_membership_terms ADD CONSTRAINT org_membership_terms_instalment_plan_check CHECK (instalment_plan IS NULL OR instalment_plan IN ('monthly'));
ALTER TABLE org_membership_terms ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;
CREATE INDEX IF NOT EXISTS org_membership_terms_subscription_idx ON org_membership_terms (processor_subscription_ref) WHERE processor_subscription_ref IS NOT NULL;

COMMIT;
