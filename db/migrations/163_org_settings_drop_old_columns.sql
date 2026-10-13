-- 163: Phase A of org/coop data separation, part 2 -- drop the columns from coop_members
-- that migration 162 moved to org_settings, now that every call site has been cut over and
-- verified live (direct SQL, RLS-scoped reads as causal_app, and a running-server check).
--
-- This lands in the same implementation pass as 162, not a deferred future cleanup -- leaving
-- these columns in place after cutover would mean coop_members still visibly carries
-- financial/compliance data even though nothing reads it there anymore, which is exactly the
-- half-migrated state this split exists to eliminate.

ALTER TABLE coop_members
  DROP COLUMN ein,
  DROP COLUMN fiscal_year_end_month,
  DROP COLUMN xero_tenant_id,
  DROP COLUMN xero_token_data,
  DROP COLUMN cooperative_profile,
  DROP COLUMN fiscal_sponsorship_mode,
  DROP COLUMN sponsorship_model,
  DROP COLUMN default_admin_rate,
  DROP COLUMN entity_classification,
  DROP COLUMN federal_grant_recipient,
  DROP COLUMN state_charitable_solicitation_registrations,
  DROP COLUMN has_lobbying_activity,
  DROP COLUMN has_political_electoral_activity,
  DROP COLUMN membership_enabled,
  DROP COLUMN reply_to_email,
  DROP COLUMN onboarding_step,
  DROP COLUMN onboarding_completed_at,
  DROP COLUMN onboarding_target_fiscal_year,
  DROP COLUMN onboarding_conversion_date,
  DROP COLUMN onboarding_has_prior_data,
  DROP COLUMN onboarding_blank_coa_chosen,
  DROP COLUMN ai_summary_text,
  DROP COLUMN ai_summary_generated_at,
  DROP COLUMN ai_summary_fiscal_year;
