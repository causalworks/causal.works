-- 019_org_sender_domains.sql
-- Sender mail domains per org (auditable; replaces hardcoded domain map in code).

ALTER TABLE orgs
  ADD COLUMN IF NOT EXISTS sender_domains TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN orgs.sender_domains IS
  'Lowercase hostnames from From: addresses (e.g. aclu.org, mail.350.org). Subdomains match if they end with .<domain> for any listed domain.';

-- Seed known domains (adjust names to match live orgs.name rows).
UPDATE orgs SET sender_domains = ARRAY['aclu.org', 'actionnetwork.org']::text[]
  WHERE LOWER(TRIM(name)) = 'aclu';

UPDATE orgs SET sender_domains = ARRAY['350.org']::text[]
  WHERE name = '350.org';

UPDATE orgs SET sender_domains = ARRAY['avaaz.org']::text[]
  WHERE LOWER(TRIM(name)) = 'avaaz';

UPDATE orgs SET sender_domains = ARRAY['action.eko.org']::text[]
  WHERE name = 'Ekō';

-- Ekō name encoding may vary in DB
UPDATE orgs SET sender_domains = ARRAY['action.eko.org']::text[]
  WHERE causal_address = 'eko@causal.work'
    AND (sender_domains IS NULL OR cardinality(sender_domains) = 0);

UPDATE orgs SET sender_domains = ARRAY['emails.sierraclub.org', 'sierraclub.org']::text[]
  WHERE name = 'Sierra Club';

UPDATE orgs SET sender_domains = ARRAY['ucsusa.org', 'action.ucsusa.org']::text[]
  WHERE name = 'Union of Concerned Scientists';

UPDATE orgs SET sender_domains = ARRAY['greenpeace.org']::text[]
  WHERE name ILIKE 'greenpeace%';

UPDATE orgs SET sender_domains = ARRAY['oxfam.org']::text[]
  WHERE name ILIKE 'oxfam%';

UPDATE orgs SET sender_domains = ARRAY['amnesty.org']::text[]
  WHERE name ILIKE 'amnesty%';

-- Optional separate row for Action Network–branded mail without a parent org match
UPDATE orgs SET sender_domains = ARRAY['actionnetwork.org']::text[]
  WHERE name = 'Action Network';
