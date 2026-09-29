-- 014_primary_region.sql
-- User/org surface regions for curated list ordering (text[] slugs: global, us, eu, uk, de, fr, other)

ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_region text[] NOT NULL DEFAULT '{}';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS primary_region text[] NOT NULL DEFAULT '{}';

-- Tag curated orgs (names must match DB rows)
UPDATE orgs SET primary_region = ARRAY['us']::text[] WHERE name IN (
  'ACLU', 'Sierra Club', 'Union of Concerned Scientists', 'Earthjustice', 'NYCLU',
  'American Civil Liberties Union', 'Economic Justice Alliance'
);

UPDATE orgs SET primary_region = ARRAY['global']::text[] WHERE name IN (
  'Ekō', '350.org', 'Avaaz'
);
