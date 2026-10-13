-- Every org must always keep at least one admin. orgs.js already enforces this at the app
-- layer (PATCH/DELETE /members/:id both check the remaining admin count before letting a
-- demotion or removal through) -- this migration adds the same DB-level backstop this
-- session already established for org-isolation (migration 137) and program-scope (259):
-- app-layer check as the primary/fast-path gate, a trigger as the backstop that holds even
-- if a future code path (a bulk tool, a script, a route that forgets the check) writes to
-- org_users directly.
--
-- Scoped to UPDATE/DELETE only, matching what the app-layer checks already cover -- org
-- creation's own code path already guarantees the first org_users row is 'admin' (orgs.js),
-- so there's no "org exists with members but never had an admin" case to also guard on INSERT.
--
-- Must NOT block a full org teardown: coop_members has org_users ON DELETE CASCADE, and
-- admin_delete_org() (schema.sql) deletes the coop_members row directly, cascading into
-- org_users -- including its admin row(s). That cascade DOES fire this row-level trigger for
-- every deleted org_users row, so the function distinguishes "this org still has other
-- members but would have zero admins" (blocked) from "this org has zero members left at all"
-- (allowed -- there's no one left to protect the invariant for).
--
-- SECURITY DEFINER (matching this codebase's established pattern for functions that must see
-- true state regardless of the calling session's RLS context -- see resolve_member_org_id_and_role(),
-- documents_due_for_local_purge()): org_users has FORCE ROW LEVEL SECURITY, and this trigger can
-- fire from a session scoped to a different org_id than the row being changed (a demotion always
-- matches, but being deliberate here avoids a future regression if that ever isn't true).

CREATE FUNCTION public.enforce_org_has_admin() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  remaining_members integer;
  remaining_admins integer;
BEGIN
  -- Irrelevant unless the row being changed WAS an admin.
  IF OLD.role IS DISTINCT FROM 'admin'::org_member_role THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- An UPDATE that keeps role = 'admin' (e.g. a program_ids-only touch, if that ever happens)
  -- isn't a demotion.
  IF TG_OP = 'UPDATE' AND NEW.role = 'admin'::org_member_role THEN
    RETURN NEW;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE role = 'admin'::org_member_role)
    INTO remaining_members, remaining_admins
    FROM org_users
    WHERE org_id = OLD.org_id AND id <> OLD.id;

  IF remaining_members = 0 THEN
    -- Nothing left in this org (full teardown, e.g. admin_delete_org()'s cascade) -- no
    -- invariant left to protect.
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF remaining_admins = 0 THEN
    RAISE EXCEPTION 'org % must always keep at least one admin', OLD.org_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_enforce_org_has_admin
  AFTER UPDATE OR DELETE ON public.org_users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_org_has_admin();
