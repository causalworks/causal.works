-- 017_org_aliases.sql
-- Canonical org alias mappings for reliable/auditable name resolution.

CREATE TABLE IF NOT EXISTS org_aliases (
  id SERIAL PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  alias_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_aliases_org_id ON org_aliases(org_id);

-- Seed common canonical aliases (punctuation, abbreviation, parenthetical variants).
WITH seed(org_name, alias) AS (
  VALUES
    ('ACLU', 'ACLU'),
    ('ACLU', 'American Civil Liberties Union'),
    ('ACLU', 'American Civil Liberties Union (ACLU)'),
    ('350.org', '350.org'),
    ('350.org', '350 org'),
    ('Union of Concerned Scientists', 'Union of Concerned Scientists'),
    ('Union of Concerned Scientists', 'UCS')
)
INSERT INTO org_aliases (org_id, alias, alias_key)
SELECT
  o.id,
  s.alias,
  regexp_replace(regexp_replace(lower(s.alias), '\([^)]*\)', '', 'g'), '[^a-z0-9]+', '', 'g') AS alias_key
FROM seed s
JOIN orgs o ON lower(o.name) = lower(s.org_name)
ON CONFLICT (alias_key) DO NOTHING;
