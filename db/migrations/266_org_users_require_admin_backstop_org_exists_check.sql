-- Replaces the "remaining org_users rows = 0" teardown signal from migrations 264/265 with
-- the actually-correct one: whether the org's own coop_members row still exists. The old
-- signal couldn't distinguish "the org itself is being deleted" (org_users emptying via
-- admin_delete_org()'s cascade -- fine, nothing left to protect) from "someone deleted an
-- org's only member row while the org itself still exists" (org_users also ends up empty,
-- but the org is now a live, unrecoverable zombie with data and no admin -- exactly the
-- state this backstop exists to prevent). Both looked identical from org_users' own row
-- count, but they aren't the same thing.
--
-- Verified this distinction works before relying on it: within the same transaction as a
-- coop_members DELETE that cascades into org_users (the actual admin_delete_org() shape),
-- the coop_members row is already gone by MVCC visibility rules by the time this trigger
-- fires on the cascaded org_users deletes -- so `NOT EXISTS (SELECT 1 FROM coop_members ...)`
-- correctly reads "org is gone" in that case, and correctly reads "org still exists" for a
-- standalone org_users DELETE/UPDATE that never touched coop_members.

CREATE OR REPLACE FUNCTION public.enforce_org_has_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_admins integer;
  org_still_exists boolean;
BEGIN
  IF OLD.role IS DISTINCT FROM 'admin'::org_member_role THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin'::org_member_role THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (SELECT 1 FROM coop_members WHERE id = OLD.org_id) INTO org_still_exists;
  IF NOT org_still_exists THEN
    -- The org itself is gone (this row change is part of that same deletion's cascade) --
    -- no invariant left to protect.
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*) FILTER (WHERE role = 'admin'::org_member_role)
    INTO remaining_admins
    FROM org_users
    WHERE org_id = OLD.org_id AND id <> OLD.id;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION 'org % must always keep at least one admin', OLD.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
