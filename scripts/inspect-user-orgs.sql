-- Chosen orgs are in user_org_preferences (not on the users row).
--
-- Option A — one shot from shell (change %seth% to their email or pattern):
--
--   psql -U postgres -h localhost -d causal_db -c "
--   SELECT u.id AS user_id, u.email, uop.org_id, o.name AS org_name,
--          COALESCE(o.subscription_status,'active') AS status
--   FROM users u
--   LEFT JOIN user_org_preferences uop ON uop.user_id = u.id
--   LEFT JOIN orgs o ON o.id = uop.org_id
--   WHERE u.email ILIKE '%seth%'
--   ORDER BY u.id, o.name NULLS LAST;
--   "
--
-- If org_id and org_name are NULL for that user, they have no saved follows
-- (onboarding not completed with orgs, or none selected).
--
-- Option B — this file with a psql variable:
--   psql -U postgres -h localhost -d causal_db -v pattern='%seth%' -f scripts/inspect-user-orgs.sql

\set ON_ERROR_STOP on

\echo ''
\echo '=== Users matching pattern ==='
SELECT id, email, created_at FROM users WHERE email ILIKE :'pattern' ORDER BY id;

\echo ''
\echo '=== Org follows (user_org_preferences) ==='
SELECT uop.user_id, uop.org_id, o.name AS org_name,
       COALESCE(o.subscription_status, 'active') AS subscription_status
FROM user_org_preferences uop
LEFT JOIN orgs o ON o.id = uop.org_id
WHERE uop.user_id IN (SELECT id FROM users WHERE email ILIKE :'pattern')
ORDER BY uop.user_id, o.name NULLS LAST;

\echo ''
