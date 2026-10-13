-- Backfill orgs.added_by_user_id for orgs that trace back to a user-submitted
-- suggestion (org_suggestions) or a formerly-private contributed org
-- (user_contributed_orgs), matched by normalized name (same normalization as
-- normalizeOrgKey() in server.js). Lets the app distinguish "user added" orgs
-- from admin-seeded ones in the Advocates/Give/Settings split.

UPDATE orgs o
SET added_by_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', ''))
    regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') AS org_key,
    user_id
  FROM org_suggestions
  WHERE user_id IS NOT NULL
  ORDER BY regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', ''), created_at ASC
) sub
WHERE o.added_by_user_id IS NULL
  AND regexp_replace(regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = sub.org_key;

UPDATE orgs o
SET added_by_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', ''))
    regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') AS org_key,
    user_id
  FROM user_contributed_orgs
  ORDER BY regexp_replace(regexp_replace(lower(org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', ''), added_at ASC
) sub
WHERE o.added_by_user_id IS NULL
  AND regexp_replace(regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '') = sub.org_key;

-- The user who originally added/suggested an org should automatically follow it.
INSERT INTO user_org_preferences (user_id, org_id, followed)
SELECT o.added_by_user_id, o.id, TRUE
FROM orgs o
WHERE o.added_by_user_id IS NOT NULL
ON CONFLICT (user_id, org_id) DO UPDATE SET followed = TRUE;
