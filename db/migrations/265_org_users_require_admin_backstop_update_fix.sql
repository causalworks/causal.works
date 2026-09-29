-- Fixes a real bug in migration 264's enforce_org_has_admin(), caught by direct testing
-- before anything depended on it: the "org has zero remaining members, so this must be a
-- full teardown, allow it" exception was checked for BOTH DELETE and UPDATE. That's only
-- correct for DELETE (the row is actually gone). For UPDATE, the row survives as a member
-- with a new role -- "zero OTHER members" just means the org has exactly one member, and
-- demoting that member away from admin must still be blocked (it would leave a real,
-- continuing org with a member but no admin), not treated as a teardown. Verified live: with
-- the migration-264 version, demoting org 84's sole admin (its only org_users row) silently
-- succeeded when it should have been rejected.

CREATE OR REPLACE FUNCTION public.enforce_org_has_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_members integer;
  remaining_admins integer;
BEGIN
  IF OLD.role IS DISTINCT FROM 'admin'::org_member_role THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin'::org_member_role THEN
    RETURN NEW;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE role = 'admin'::org_member_role)
    INTO remaining_members, remaining_admins
    FROM org_users
    WHERE org_id = OLD.org_id AND id <> OLD.id;

  -- The "nothing left to protect" exception only applies when the row is actually being
  -- removed (a full org teardown, e.g. admin_delete_org()'s cascade). An UPDATE never
  -- removes the row -- it survives with a new, non-admin role -- so it always needs a
  -- surviving admin among the other rows, with no teardown exception.
  IF TG_OP = 'DELETE' AND remaining_members = 0 THEN
    RETURN OLD;
  END IF;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION 'org % must always keep at least one admin', OLD.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
