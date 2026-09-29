-- 096: Gift / transaction records for constituent CRM
-- Covers grants, individual donations, pledges, and membership dues (display only).
-- coop_org_membership_payments stays separate; gifts JOIN both for giving history view.

DO $$ BEGIN
  CREATE TYPE gift_type AS ENUM ('grant','donation','pledge','membership_dues');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE gift_payment_method AS ENUM
    ('check','ach','wire','credit_card','cash','stripe','in_kind','other');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS coop_gifts (
  id                          SERIAL PRIMARY KEY,
  coop_org_id                 INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  constituent_id              INTEGER REFERENCES coop_constituents(id) ON DELETE SET NULL,
  grant_id                    INTEGER REFERENCES coop_grants(id) ON DELETE SET NULL,
  soft_credit_constituent_id  INTEGER REFERENCES coop_constituents(id) ON DELETE SET NULL,
  gift_type                   gift_type NOT NULL DEFAULT 'donation',
  amount_cents                BIGINT NOT NULL CHECK (amount_cents >= 0),
  currency                    VARCHAR(3) NOT NULL DEFAULT 'USD',
  received_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method              gift_payment_method,
  stripe_payment_intent_id    TEXT,
  campaign                    TEXT,
  acknowledgment_sent_at      TIMESTAMPTZ,
  receipt_sent_at             TIMESTAMPTZ,
  notes                       TEXT,
  recorded_by_user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coop_gifts_org
  ON coop_gifts(coop_org_id);

CREATE INDEX IF NOT EXISTS idx_coop_gifts_constituent
  ON coop_gifts(constituent_id);

CREATE INDEX IF NOT EXISTS idx_coop_gifts_grant
  ON coop_gifts(grant_id) WHERE grant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coop_gifts_received_at
  ON coop_gifts(coop_org_id, received_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_coop_gifts_stripe
  ON coop_gifts(stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION update_coop_gifts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_coop_gifts_updated_at ON coop_gifts;
CREATE TRIGGER trigger_coop_gifts_updated_at
  BEFORE UPDATE ON coop_gifts
  FOR EACH ROW EXECUTE FUNCTION update_coop_gifts_updated_at();
