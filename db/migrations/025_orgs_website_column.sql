-- Optional website TEXT (spec); prefer over website_url for display/SEO when set.
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS website TEXT;
UPDATE orgs SET website = website_url WHERE (website IS NULL OR TRIM(website) = '') AND website_url IS NOT NULL;
