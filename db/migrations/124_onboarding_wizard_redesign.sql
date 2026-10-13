-- 124: Onboarding wizard redesign — fiscal-year timeline fields, deliberate-blank-COA
-- flag, new 'prior_data' wizard step, and user-level reusable org setup presets
-- ("skip guided setup" for experienced users who manage multiple orgs and already
-- have a preferred chart of accounts, applied to a new org rather than starting blank).

-- ── Fiscal-year timeline + blank-COA flag on coop_orgs ─────────────────────

ALTER TABLE coop_orgs
  ADD COLUMN IF NOT EXISTS onboarding_target_fiscal_year SMALLINT,
  ADD COLUMN IF NOT EXISTS onboarding_conversion_date DATE,
  ADD COLUMN IF NOT EXISTS onboarding_has_prior_data BOOLEAN,
  ADD COLUMN IF NOT EXISTS onboarding_blank_coa_chosen BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN coop_orgs.onboarding_target_fiscal_year IS
  'Which fiscal year the org is setting up a budget for, answered during onboarding basics.';
COMMENT ON COLUMN coop_orgs.onboarding_conversion_date IS
  'Go-live date the user gave during onboarding (Xero-style conversion date) — drives whether the prior_data step offers an opening-balances import.';
COMMENT ON COLUMN coop_orgs.onboarding_has_prior_data IS
  'Whether the user said they have prior-year budget/actuals to import, answered at the prior_data wizard step.';
COMMENT ON COLUMN coop_orgs.onboarding_blank_coa_chosen IS
  'TRUE only when the user explicitly clicked through the "start with a blank workspace" confirmation in the Accounts step. Distinguishes "deliberately blank" from "hasn''t set up accounts yet" so onboarding cannot silently complete with an empty chart of accounts.';

-- ── Widen onboarding_step to add the new 'prior_data' step ─────────────────

ALTER TABLE coop_orgs DROP CONSTRAINT IF EXISTS coop_orgs_onboarding_step_check;
ALTER TABLE coop_orgs ADD CONSTRAINT coop_orgs_onboarding_step_check
  CHECK (onboarding_step = ANY (ARRAY['basics','accounts','prior_data','programs','complete']::text[]));

COMMENT ON COLUMN coop_orgs.onboarding_step IS 'Wizard progress: basics → accounts → prior_data → programs → complete.';

-- ── User-level reusable org setup presets ──────────────────────────────────
-- Scoped to the user, not any single org, so a preset saved while managing Org A
-- can be applied when creating Org B. Snapshot-based (JSONB), not a live link to
-- the source org, so later edits to the source org don't retroactively change a
-- saved preset — same philosophy as coop_personnel's copy-from-prior-year, which
-- copies rows rather than referencing them.

CREATE TABLE IF NOT EXISTS user_org_setup_presets (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_coop_org_id INTEGER REFERENCES coop_orgs(id) ON DELETE SET NULL,
  accounts_snapshot JSONB NOT NULL,
  programs_snapshot JSONB,
  fiscal_year_end_month SMALLINT,
  account_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT user_org_setup_presets_name_len CHECK (char_length(name) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS idx_user_org_setup_presets_user_id ON user_org_setup_presets(user_id);

COMMENT ON TABLE user_org_setup_presets IS
  'A user''s saved chart-of-accounts/program setup, reusable across orgs they create — the "I''ve done this before" path in the Accounts onboarding step.';
COMMENT ON COLUMN user_org_setup_presets.accounts_snapshot IS
  'Array of account rows in the same shape POST /accounts/bulk accepts; replayed verbatim into a new org, never mutated in place.';
COMMENT ON COLUMN user_org_setup_presets.programs_snapshot IS
  'Optional array of {name, code} program rows captured at save time, applied after accounts_snapshot on apply-preset.';
