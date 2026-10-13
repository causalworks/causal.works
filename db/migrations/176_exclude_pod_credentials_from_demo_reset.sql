-- 176: Exclude org_pod_credentials from demo_org_reset_tables().
--
-- Same class of bug as rev 52 (see that DevPath entry), caught proactively
-- this time instead of after it broke something: org_pod_credentials has an
-- org_id FK to coop_members, so it would otherwise be auto-included in the
-- nightly demo-company reset. That reset works by DELETE-then-restore-from-
-- snapshot; since no snapshot has ever captured this table, every nightly
-- reset would silently delete demo-company's pod credential row and never
-- restore it, breaking pod access until manually re-provisioned. Credentials
-- are durable infrastructure, not demo content - same reasoning org_users is
-- already excluded for.

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
      AND tc.table_name NOT IN ('org_users', 'org_invites', 'org_membership_tiers', 'org_audit_log', 'org_pod_credentials')
    ORDER BY 1
  );
$function$;
