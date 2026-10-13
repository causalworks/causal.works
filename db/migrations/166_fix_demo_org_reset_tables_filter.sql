-- 166: Fix a real regression migration 165 introduced in demo_org_reset_tables().
--
-- That function selected eligible tables by bare column name (`column_name = 'coop_org_id'`,
-- then `'org_id'` after 165's rename). Before 165, `coop_org_id` was a name unique to
-- Organizational-workspace tenant tables. After 165 renamed it to the much more generic
-- `org_id`, the same filter started matching unrelated Individual-app/civic tables that
-- coincidentally also have a column named `org_id` -- but referencing a different table
-- entirely (`orgs`, the followable-nonprofit-directory table, not `coop_members`): `actions`,
-- `contributions`, `org_aliases`, `org_donation_url_suggestions`, `user_org_petition_signatures`,
-- `user_org_preferences`. Confirmed live: demo_org_reset_tables() picked up all 6 of these
-- immediately after 165 applied. Fix: filter by actual FK target (references coop_members),
-- not by column name text -- a meaning-based filter that can't be fooled by a future column
-- name collision the way the text-based one just was.

CREATE OR REPLACE FUNCTION public.demo_org_reset_tables()
 RETURNS text[]
 LANGUAGE sql
 STABLE
AS $function$
  SELECT ARRAY(
    SELECT DISTINCT tc.table_name::text
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
    JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'coop_members'
      AND kcu.column_name = 'org_id'
      AND tc.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log')
    ORDER BY 1
  );
$function$;
