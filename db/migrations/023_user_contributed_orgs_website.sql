-- 023_user_contributed_orgs_website.sql
-- Store website URL from ProPublica matches for user-contributed orgs.

ALTER TABLE user_contributed_orgs
  ADD COLUMN IF NOT EXISTS website_url TEXT;
