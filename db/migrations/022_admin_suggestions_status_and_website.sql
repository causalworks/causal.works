-- 022_admin_suggestions_status_and_website.sql
-- Add status + website fields for admin suggestion workflow.

ALTER TABLE org_suggestions
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';

ALTER TABLE org_suggestions
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS propublica_verified BOOLEAN NOT NULL DEFAULT false;
