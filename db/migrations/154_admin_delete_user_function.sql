-- 154: platform-admin hard-delete of a user (server.js /admin/users/:userId/delete).
--
-- Same reasoning as admin_delete_org (migration 149): a narrow, auditable
-- SECURITY DEFINER function for a cross-cutting admin operation that isn't
-- scoped to a single org, so it can't go through the per-request
-- app.current_org_id GUC mechanism.
--
-- Most FKs to users(id) are ON DELETE CASCADE or ON DELETE SET NULL and
-- clean up automatically. Seven nullable audit/preference columns use
-- ON DELETE NO ACTION (restrict) and would otherwise block the delete:
--   user_org_preferences.user_id
--   org_allocation_schedules.created_by / updated_by
--   org_personnel.created_by / updated_by
--   org_projections.created_by / updated_by
-- user_org_preferences rows are meaningless without the user, so they're
-- deleted outright; the org_* audit columns are cleared to NULL so the
-- org's historical records survive.
--
-- Two more columns are declared ON DELETE SET NULL but are themselves
-- NOT NULL (a pre-existing schema inconsistency, not introduced here):
--   workshop_proposals.proposed_by_user_id
--   cooperative_library_submissions.proposed_by_user_id
-- The cascade trigger's SET NULL fails against the NOT NULL constraint,
-- so those proposal/submission rows are deleted outright instead.

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id integer)
RETURNS TABLE(id integer, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM user_org_preferences WHERE user_org_preferences.user_id = p_user_id;
  UPDATE org_allocation_schedules SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_allocation_schedules SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_personnel SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_personnel SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_projections SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_projections SET updated_by = NULL WHERE updated_by = p_user_id;
  DELETE FROM workshop_proposals WHERE proposed_by_user_id = p_user_id;
  DELETE FROM cooperative_library_submissions WHERE proposed_by_user_id = p_user_id;

  RETURN QUERY
  DELETE FROM users WHERE users.id = p_user_id
  RETURNING users.id, users.email::text;
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_user(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user(integer) TO causal_app;
