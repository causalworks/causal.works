-- Cached "what this org is working on" summary for the Advocates roster
-- (Proxies > Advocates). Generated on-demand from the org's recent actions,
-- same cache-column pattern as coop_orgs.ai_summary_text.

ALTER TABLE orgs ADD COLUMN IF NOT EXISTS activity_summary_text text;
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS activity_summary_generated_at timestamp with time zone;
