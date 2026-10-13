-- Per-admin accounting entry switch (2026-10-04). An admin is never limited by the system, but each admin chooses whether
-- they personally can enter and edit accounting transactions. Default OFF (the person who administers users and settings is
-- not also posting entries); switch ON when needed, e.g. during a staff transition. It only matters in a workspace that has
-- a finance-role member; with none, admins can always enter transactions so a one-person org is never locked out.
-- finance members are emailed when it is switched on or off; a reminder email goes to the admin after 30 days on, who can
-- keep it on for another 30 days or turn it off.

ALTER TABLE org_users
  ADD COLUMN IF NOT EXISTS accounting_entry_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS accounting_entry_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS accounting_entry_reminded_at timestamptz;

-- demo-company: Guy's working account and the shared demo account stay ON so the demo and the review work continue.
UPDATE org_users SET accounting_entry_enabled = true, accounting_entry_enabled_at = now()
 WHERE org_id = (SELECT id FROM coop_members WHERE slug = 'demo-company')
   AND user_id IN (SELECT id FROM users WHERE lower(email) IN ('gyacc@pm.me', 'demo@causal.works'));

-- The daily reminder job runs without an org context, so it reads across orgs through this SECURITY DEFINER function, which
-- also marks each reminder as sent (once per switched-on period).
CREATE OR REPLACE FUNCTION accounting_entry_reminders_due()
RETURNS TABLE(org_user_id integer, org_id integer, org_slug text, org_name text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    UPDATE org_users ou SET accounting_entry_reminded_at = now()
      FROM coop_members o, users u
     WHERE o.id = ou.org_id AND u.id = ou.user_id AND o.deleted_at IS NULL
       AND ou.role = 'admin' AND ou.accounting_entry_enabled
       AND ou.accounting_entry_enabled_at <= now() - interval '30 days'
       AND (ou.accounting_entry_reminded_at IS NULL OR ou.accounting_entry_reminded_at < ou.accounting_entry_enabled_at)
    RETURNING ou.id, ou.org_id, o.slug, o.display_name, u.email
  )
  SELECT id, org_id, slug, display_name, email FROM due;
$$;
GRANT EXECUTE ON FUNCTION accounting_entry_reminders_due() TO causal_app;
