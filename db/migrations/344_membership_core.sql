-- Membership core: workspace settings, tiers with dated prices, terms, seats, reshaped payments,
-- message templates and log, the manage_membership permission, and the move of org_members rows
-- to contacts and terms.

BEGIN;

-- --- Settings ---

CREATE TABLE IF NOT EXISTS org_membership_settings (
  org_id                     integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
  year_mode                  text NOT NULL DEFAULT 'rolling' CHECK (year_mode IN ('rolling', 'fixed')),
  fixed_start_month          smallint NOT NULL DEFAULT 1 CHECK (fixed_start_month BETWEEN 1 AND 12),
  fixed_start_day            smallint NOT NULL DEFAULT 1 CHECK (fixed_start_day BETWEEN 1 AND 31),
  renewal_window_days        integer NOT NULL DEFAULT 60 CHECK (renewal_window_days BETWEEN 0 AND 366),
  proration_mode             text NOT NULL DEFAULT 'none' CHECK (proration_mode IN ('none', 'monthly')),
  grace_days                 integer NOT NULL DEFAULT 30 CHECK (grace_days BETWEEN 0 AND 366),
  join_requires_approval     boolean NOT NULL DEFAULT false,
  recognition_mode           text NOT NULL DEFAULT 'spread' CHECK (recognition_mode IN ('spread', 'at_receipt')),
  deferred_dues_account_id   integer REFERENCES org_accounts(id),
  contribution_account_id    integer REFERENCES org_accounts(id),
  dues_revenue_account_id    integer REFERENCES org_accounts(id),
  default_program_id         integer REFERENCES org_programs(id),
  directory_fields           text[] NOT NULL DEFAULT '{}',
  join_form_enabled          boolean NOT NULL DEFAULT false,
  form_fields                jsonb NOT NULL DEFAULT '[]'::jsonb,
  extra_gift_enabled         boolean NOT NULL DEFAULT false,
  auto_renew_default         boolean NOT NULL DEFAULT false,
  challenge_required         boolean NOT NULL DEFAULT false,
  updated_by                 integer REFERENCES users(id) ON DELETE SET NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_membership_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_settings_org_isolation ON org_membership_settings;
CREATE POLICY org_membership_settings_org_isolation ON org_membership_settings
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_settings TO causal_app;

-- --- Tiers and dated prices ---

ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS applies_to text NOT NULL DEFAULT 'either';
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS pay_what_you_can boolean NOT NULL DEFAULT false;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS min_price_cents integer;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS suggested_price_cents integer;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS budget_low_cents bigint;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS budget_high_cents bigint;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS benefit_value_cents integer;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS seats_included integer NOT NULL DEFAULT 0;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS benefits text[] NOT NULL DEFAULT '{}';
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS eligibility_statement text;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS eligibility_required boolean NOT NULL DEFAULT false;
ALTER TABLE org_membership_tiers ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE org_membership_tiers DROP CONSTRAINT IF EXISTS org_membership_tiers_applies_to_check;
ALTER TABLE org_membership_tiers ADD CONSTRAINT org_membership_tiers_applies_to_check CHECK (applies_to IN ('individual', 'organization', 'either'));
ALTER TABLE org_membership_tiers DROP CONSTRAINT IF EXISTS org_membership_tiers_amounts_check;
ALTER TABLE org_membership_tiers ADD CONSTRAINT org_membership_tiers_amounts_check CHECK (
  (min_price_cents IS NULL OR min_price_cents >= 0)
  AND (suggested_price_cents IS NULL OR suggested_price_cents >= 0)
  AND (benefit_value_cents IS NULL OR benefit_value_cents >= 0)
  AND seats_included >= 0
  AND (budget_low_cents IS NULL OR budget_high_cents IS NULL OR budget_high_cents >= budget_low_cents));

CREATE TABLE IF NOT EXISTS org_membership_tier_prices (
  id            serial PRIMARY KEY,
  org_id        integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  tier_id       integer NOT NULL REFERENCES org_membership_tiers(id) ON DELETE CASCADE,
  effective_on  date NOT NULL,
  price_cents   integer NOT NULL CHECK (price_cents >= 0),
  created_by    integer REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tier_id, effective_on)
);
ALTER TABLE org_membership_tier_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_tier_prices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_tier_prices_org_isolation ON org_membership_tier_prices;
CREATE POLICY org_membership_tier_prices_org_isolation ON org_membership_tier_prices
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_membership_tier_prices TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_tier_prices_id_seq TO causal_app;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_membership_tiers' AND column_name = 'dues_amount_cents') THEN
    INSERT INTO org_membership_tier_prices (org_id, tier_id, effective_on, price_cents)
    SELECT t.org_id, t.id, LEAST(t.created_at::date, '2000-01-01'::date), t.dues_amount_cents FROM org_membership_tiers t
    ON CONFLICT (tier_id, effective_on) DO NOTHING;
    ALTER TABLE org_membership_tiers DROP COLUMN dues_amount_cents;
  END IF;
END $$;

-- --- Terms ---

CREATE TABLE IF NOT EXISTS org_membership_terms (
  id                          serial PRIMARY KEY,
  org_id                      integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  constituent_id              integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  tier_id                     integer REFERENCES org_membership_tiers(id),
  starts_on                   date NOT NULL,
  ends_on                     date NOT NULL,
  price_cents                 integer NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
  contribution_cents          integer NOT NULL DEFAULT 0 CHECK (contribution_cents >= 0),
  source                      text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'join_form', 'renewal', 'import')),
  status_override             text CHECK (status_override IN ('ended')),
  status_reason               text,
  ended_on                    date,
  ended_by                    integer REFERENCES users(id) ON DELETE SET NULL,
  extension_count             integer NOT NULL DEFAULT 0,
  invoice_id                  integer REFERENCES org_invoices(id) ON DELETE SET NULL,
  auto_renew                  boolean NOT NULL DEFAULT false,
  processor_subscription_ref  text,
  renews_term_id              integer REFERENCES org_membership_terms(id) ON DELETE SET NULL,
  created_by                  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  CHECK (status_override IS NULL OR length(btrim(COALESCE(status_reason, ''))) > 0)
);
CREATE INDEX IF NOT EXISTS org_membership_terms_contact_idx ON org_membership_terms (org_id, constituent_id);
CREATE INDEX IF NOT EXISTS org_membership_terms_ends_idx ON org_membership_terms (org_id, ends_on);
ALTER TABLE org_membership_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_terms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_terms_org_isolation ON org_membership_terms;
CREATE POLICY org_membership_terms_org_isolation ON org_membership_terms
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_terms TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_terms_id_seq TO causal_app;

-- --- Seats ---

CREATE TABLE IF NOT EXISTS org_membership_seats (
  id              serial PRIMARY KEY,
  org_id          integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  term_id         integer NOT NULL REFERENCES org_membership_terms(id) ON DELETE CASCADE,
  constituent_id  integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  label           text,
  starts_on       date NOT NULL DEFAULT CURRENT_DATE,
  ends_on         date,
  created_by      integer REFERENCES users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS org_membership_seats_term_idx ON org_membership_seats (term_id);
ALTER TABLE org_membership_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_seats FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_seats_org_isolation ON org_membership_seats;
CREATE POLICY org_membership_seats_org_isolation ON org_membership_seats
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_seats TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_seats_id_seq TO causal_app;

-- --- Payments ---

ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS org_id integer REFERENCES coop_members(id) ON DELETE CASCADE;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS term_id integer REFERENCES org_membership_terms(id) ON DELETE CASCADE;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS constituent_id integer REFERENCES org_constituents(id) ON DELETE CASCADE;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'payment';
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS method text;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS discount_reason text;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS reason text;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS processor_ref text;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS approved_by integer REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE org_membership_payments ADD COLUMN IF NOT EXISTS refund_of_id integer REFERENCES org_membership_payments(id);
CREATE UNIQUE INDEX IF NOT EXISTS org_membership_payments_processor_ref_key ON org_membership_payments (processor_ref) WHERE processor_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS org_membership_payments_term_idx ON org_membership_payments (term_id);

ALTER TABLE org_membership_payments DROP CONSTRAINT IF EXISTS org_membership_payments_posting_status_check;
ALTER TABLE org_membership_payments ADD CONSTRAINT org_membership_payments_posting_status_check
  CHECK (posting_status IN ('unposted', 'posted', 'void', 'not_applicable'));

-- --- Message templates and log ---

CREATE TABLE IF NOT EXISTS org_membership_templates (
  id           serial PRIMARY KEY,
  org_id       integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  key          text NOT NULL CHECK (key ~ '^[a-z0-9_]+$'),
  subject      text NOT NULL,
  body         text NOT NULL,
  offset_days  integer NOT NULL DEFAULT 0,
  enabled      boolean NOT NULL DEFAULT true,
  updated_by   integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, key)
);
ALTER TABLE org_membership_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_templates_org_isolation ON org_membership_templates;
CREATE POLICY org_membership_templates_org_isolation ON org_membership_templates
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_membership_templates TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_templates_id_seq TO causal_app;

CREATE TABLE IF NOT EXISTS org_membership_messages (
  id                    bigserial PRIMARY KEY,
  org_id                integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  term_id               integer NOT NULL REFERENCES org_membership_terms(id) ON DELETE CASCADE,
  constituent_id        integer NOT NULL REFERENCES org_constituents(id) ON DELETE CASCADE,
  template_key          text NOT NULL,
  offset_days           integer NOT NULL DEFAULT 0,
  to_email              text,
  status                text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  provider_message_id   text,
  sent_at               timestamptz,
  delivered_at          timestamptz,
  opened_at             timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (term_id, template_key, offset_days)
);
CREATE INDEX IF NOT EXISTS org_membership_messages_contact_idx ON org_membership_messages (org_id, constituent_id);
ALTER TABLE org_membership_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_messages_org_isolation ON org_membership_messages;
CREATE POLICY org_membership_messages_org_isolation ON org_membership_messages
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_messages TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_messages_id_seq TO causal_app;

-- --- Permission ---

DO $$
DECLARE
  def text;
  vals text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
   WHERE c.conname = 'org_access_permissions_permission_check' AND c.conrelid = 'org_access_permissions'::regclass;
  SELECT array_agg(m[1]) INTO vals FROM regexp_matches(COALESCE(def, ''), '''([a-z_]+)''', 'g') AS m;
  IF vals IS NULL OR NOT ('manage_membership' = ANY (vals)) THEN
    vals := COALESCE(vals, '{}') || 'manage_membership'::text;
    ALTER TABLE org_access_permissions DROP CONSTRAINT IF EXISTS org_access_permissions_permission_check;
    EXECUTE format('ALTER TABLE org_access_permissions ADD CONSTRAINT org_access_permissions_permission_check CHECK (permission = ANY (%L::text[]))', vals);
  END IF;
END $$;

-- --- Move org_members to contacts and terms ---

DO $$
DECLARE
  m record;
  v_contact integer;
  v_term integer;
  v_price integer;
BEGIN
  IF to_regclass('public.org_members') IS NULL THEN
    RETURN;
  END IF;

  FOR m IN SELECT * FROM org_members ORDER BY id LOOP
    SELECT c.id INTO v_contact FROM org_constituents c
     WHERE c.org_id = m.org_id
       AND (lower(c.email) = lower(m.email) OR lower(m.email) = ANY (SELECT lower(x) FROM unnest(COALESCE(c.additional_emails, '{}')) x))
     ORDER BY c.id LIMIT 1;
    IF v_contact IS NULL THEN
      INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, phone, mailing_address, notes, kind)
      VALUES (m.org_id, btrim(m.first_name || ' ' || m.last_name), m.first_name, m.last_name, m.email, m.phone, m.mailing_address, m.notes, 'individual')
      RETURNING id INTO v_contact;
    ELSE
      UPDATE org_constituents SET
        phone = COALESCE(phone, m.phone),
        mailing_address = COALESCE(mailing_address, m.mailing_address),
        notes = CASE WHEN m.notes IS NULL THEN notes WHEN notes IS NULL THEN m.notes ELSE notes || E'\n' || m.notes END
       WHERE id = v_contact;
    END IF;

    INSERT INTO org_contact_roles (org_id, constituent_id, role, starts_on)
    VALUES (m.org_id, v_contact, 'dues_member', LEAST(m.joined_at::date, CURRENT_DATE))
    ON CONFLICT (constituent_id, role, starts_on) DO NOTHING;

    SELECT p.price_cents INTO v_price FROM org_membership_tier_prices p
     WHERE p.tier_id = m.tier_id ORDER BY p.effective_on DESC LIMIT 1;

    INSERT INTO org_membership_terms (org_id, constituent_id, tier_id, starts_on, ends_on, price_cents, source,
                                      status_override, status_reason, ended_on, created_at)
    VALUES (m.org_id, v_contact, m.tier_id, m.current_period_start::date,
            GREATEST(m.current_period_end::date, m.current_period_start::date), COALESCE(v_price, 0), 'import',
            CASE WHEN m.status::text = 'terminated' THEN 'ended' END,
            CASE WHEN m.status::text = 'terminated' THEN 'Ended before membership terms were introduced' END,
            CASE WHEN m.status::text = 'terminated' THEN LEAST(m.updated_at::date, CURRENT_DATE) END,
            m.created_at)
    RETURNING id INTO v_term;

    UPDATE org_membership_payments SET org_id = m.org_id, term_id = v_term, constituent_id = v_contact
     WHERE member_id = m.id;

    INSERT INTO org_membership_messages (org_id, term_id, constituent_id, template_key, offset_days, status, sent_at, delivered_at, created_at)
    SELECT m.org_id, v_term, v_contact, r.reminder_type::text, 0, 'sent', r.sent_at, CASE WHEN r.delivered THEN r.sent_at END, r.sent_at
      FROM org_membership_reminders r WHERE r.member_id = m.id
    ON CONFLICT (term_id, template_key, offset_days) DO NOTHING;
  END LOOP;

  UPDATE org_membership_payments SET method = CASE
      WHEN lower(COALESCE(payment_method, '')) IN ('card', 'credit_card', 'credit card', 'stripe') THEN 'card'
      WHEN lower(COALESCE(payment_method, '')) IN ('check', 'cheque') THEN 'check'
      WHEN lower(COALESCE(payment_method, '')) IN ('transfer', 'ach', 'wire', 'bank transfer') THEN 'transfer'
      WHEN lower(COALESCE(payment_method, '')) = 'cash' THEN 'cash'
      ELSE 'other' END
   WHERE method IS NULL;
  UPDATE org_membership_payments SET notes = CASE WHEN notes IS NULL THEN 'Method: ' || payment_method ELSE notes || ' (method: ' || payment_method || ')' END
   WHERE payment_method IS NOT NULL AND method = 'other';

  DROP POLICY IF EXISTS org_org_membership_payments_org_isolation ON org_membership_payments;
  DROP TABLE org_membership_reminders;
  ALTER TABLE org_membership_payments DROP COLUMN member_id, DROP COLUMN period_covered_start, DROP COLUMN period_covered_end, DROP COLUMN payment_method;
  DROP TABLE org_members;
  DROP FUNCTION IF EXISTS update_membership_members_updated_at();
  DROP TYPE IF EXISTS membership_status;
  DROP TYPE IF EXISTS reminder_type;
END $$;

ALTER TABLE org_membership_payments ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE org_membership_payments ALTER COLUMN term_id SET NOT NULL;
ALTER TABLE org_membership_payments ALTER COLUMN constituent_id SET NOT NULL;
ALTER TABLE org_membership_payments DROP CONSTRAINT IF EXISTS org_membership_payments_kind_check;
ALTER TABLE org_membership_payments ADD CONSTRAINT org_membership_payments_kind_check CHECK (kind IN ('payment', 'refund', 'waiver'));
ALTER TABLE org_membership_payments DROP CONSTRAINT IF EXISTS org_membership_payments_method_check;
ALTER TABLE org_membership_payments ADD CONSTRAINT org_membership_payments_method_check
  CHECK (method IS NULL OR method IN ('card', 'check', 'transfer', 'cash', 'other'));
ALTER TABLE org_membership_payments DROP CONSTRAINT IF EXISTS org_membership_payments_rules_check;
ALTER TABLE org_membership_payments ADD CONSTRAINT org_membership_payments_rules_check CHECK (
  discount_cents >= 0
  AND (discount_cents = 0 OR length(btrim(COALESCE(discount_reason, ''))) > 0)
  AND (kind = 'payment' OR length(btrim(COALESCE(reason, ''))) > 0)
  AND (kind <> 'refund' OR refund_of_id IS NOT NULL)
  AND (kind = 'payment' OR method IS NOT NULL OR kind = 'waiver')
  AND (approved_by IS NULL OR recorded_by_user_id IS NULL OR approved_by <> recorded_by_user_id));

ALTER TABLE org_membership_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_membership_payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_membership_payments_org_isolation ON org_membership_payments;
CREATE POLICY org_membership_payments_org_isolation ON org_membership_payments
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_membership_payments TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_payments_id_seq TO causal_app;
GRANT SELECT, INSERT, UPDATE ON org_membership_tiers TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_membership_tiers_id_seq TO causal_app;

COMMIT;
