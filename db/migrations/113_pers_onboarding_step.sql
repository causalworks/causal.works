-- 113: generic onboarding_step gate for pers users, mirroring coop_orgs' pattern.
-- Replaces the ad-hoc "onboarding_complete = !!bank_payoff_seen_at" check with a
-- real step column so future onboarding steps don't need their own bolt-on flag.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_step text NOT NULL DEFAULT 'bank';
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

-- Backfill: anyone who already finished the bank wizard is 'complete'.
UPDATE users
SET onboarding_step = 'complete',
    onboarding_completed_at = COALESCE(onboarding_completed_at, bank_payoff_seen_at)
WHERE bank_payoff_seen_at IS NOT NULL AND onboarding_step <> 'complete';
