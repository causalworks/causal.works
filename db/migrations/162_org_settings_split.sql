-- 162: Phase A of org/coop data separation -- create org_settings.
--
-- coop_members (the org entity table, renamed from coop_orgs in rev 41) has accumulated
-- ~25 org-private financial/compliance/integration columns (EIN, fiscal_year_end_month,
-- Xero tokens, compliance flags, onboarding state, cached AI summary, cooperative_profile)
-- alongside its ~7 genuinely coop-network roster columns (display_name, slug,
-- membership_status, mission_summary, location_general, size_band, cooperative_turnarounds).
-- The real coop-directory query (cooperative.js's member list) only ever selects the latter
-- set -- cooperative_profile in particular is never read by anything coop-network-facing
-- despite its name. This migration creates org_settings to hold the org-private half and
-- backfills it. A follow-up migration (163) drops the moved columns from coop_members once
-- every call site is cut over and verified live -- both land in the same implementation pass,
-- not staged across separate future sessions.
--
-- org_settings uses `org_id` (not `coop_org_id`) as its column name -- new org-private schema
-- in this codebase should not carry the coop_ prefix. The existing 34 org_* tables' own
-- coop_org_id column is a separate, later rename (migration 165).

CREATE TABLE org_settings (
    org_id integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
    ein text,
    fiscal_year_end_month smallint,
    xero_tenant_id text,
    xero_token_data jsonb,
    org_profile_data jsonb,
    fiscal_sponsorship_mode boolean DEFAULT false NOT NULL,
    sponsorship_model public.sponsorship_model_enum,
    default_admin_rate numeric(5,2),
    entity_classification text,
    federal_grant_recipient boolean DEFAULT false NOT NULL,
    state_charitable_solicitation_registrations text[],
    has_lobbying_activity boolean DEFAULT false NOT NULL,
    has_political_electoral_activity boolean DEFAULT false NOT NULL,
    membership_enabled boolean DEFAULT false NOT NULL,
    reply_to_email text,
    onboarding_step text DEFAULT 'basics'::text NOT NULL,
    onboarding_completed_at timestamp with time zone,
    onboarding_target_fiscal_year smallint,
    onboarding_conversion_date date,
    onboarding_has_prior_data boolean,
    onboarding_blank_coa_chosen boolean DEFAULT false NOT NULL,
    ai_summary_text text,
    ai_summary_generated_at timestamp with time zone,
    ai_summary_fiscal_year smallint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT org_settings_default_admin_rate_check CHECK (((default_admin_rate >= (0)::numeric) AND (default_admin_rate <= (100)::numeric))),
    CONSTRAINT org_settings_fiscal_year_end_month_check CHECK (((fiscal_year_end_month >= 1) AND (fiscal_year_end_month <= 12))),
    CONSTRAINT org_settings_onboarding_step_check CHECK ((onboarding_step = ANY (ARRAY['basics'::text, 'accounts'::text, 'prior_data'::text, 'programs'::text, 'complete'::text])))
);

COMMENT ON COLUMN org_settings.org_profile_data IS 'Was coop_members.cooperative_profile; relocated because nothing coop-network-facing reads it (runway_months/cash_balance_cents for the org''s own board report, plus mission/program_areas/region/website profile fields the org edits about itself).';
COMMENT ON COLUMN org_settings.ai_summary_text IS 'Last generated nonprofit finance summary for executives; refreshed at most daily by GET /summary.';
COMMENT ON COLUMN org_settings.ai_summary_generated_at IS 'When ai_summary_text was produced; application uses 24h TTL unless ?refresh=1.';

ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY org_settings_org_isolation ON org_settings
  USING ((org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));

-- causal_app already has SELECT/INSERT/UPDATE/DELETE on this table via migration 137's
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ... TO causal_app`, which applies to
-- tables created after that migration too -- no explicit GRANT needed here.

INSERT INTO org_settings (
    org_id, ein, fiscal_year_end_month, xero_tenant_id, xero_token_data, org_profile_data,
    fiscal_sponsorship_mode, sponsorship_model, default_admin_rate, entity_classification,
    federal_grant_recipient, state_charitable_solicitation_registrations, has_lobbying_activity,
    has_political_electoral_activity, membership_enabled, reply_to_email, onboarding_step,
    onboarding_completed_at, onboarding_target_fiscal_year, onboarding_conversion_date,
    onboarding_has_prior_data, onboarding_blank_coa_chosen, ai_summary_text,
    ai_summary_generated_at, ai_summary_fiscal_year, created_at, updated_at
)
SELECT
    id, ein, fiscal_year_end_month, xero_tenant_id, xero_token_data, cooperative_profile,
    fiscal_sponsorship_mode, sponsorship_model, default_admin_rate, entity_classification,
    federal_grant_recipient, state_charitable_solicitation_registrations, has_lobbying_activity,
    has_political_electoral_activity, membership_enabled, reply_to_email, onboarding_step,
    onboarding_completed_at, onboarding_target_fiscal_year, onboarding_conversion_date,
    onboarding_has_prior_data, onboarding_blank_coa_chosen, ai_summary_text,
    ai_summary_generated_at, ai_summary_fiscal_year, created_at, updated_at
FROM coop_members;
