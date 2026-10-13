-- 158: admin_delete_user() also revokes the deleted user's invite/allowlist
-- entry (migration 157's allowed_emails table), so a deleted user can't
-- immediately sign back up or log in without an admin re-inviting them.

CREATE OR REPLACE FUNCTION admin_delete_user(p_user_id integer)
RETURNS TABLE(id integer, email text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
BEGIN
  SELECT users.email INTO v_email FROM users WHERE users.id = p_user_id;

  DELETE FROM user_org_preferences WHERE user_org_preferences.user_id = p_user_id;
  UPDATE org_allocation_schedules SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_allocation_schedules SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_personnel SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_personnel SET updated_by = NULL WHERE updated_by = p_user_id;
  UPDATE org_projections SET created_by = NULL WHERE created_by = p_user_id;
  UPDATE org_projections SET updated_by = NULL WHERE updated_by = p_user_id;
  DELETE FROM workshop_proposals WHERE proposed_by_user_id = p_user_id;
  DELETE FROM cooperative_library_submissions WHERE proposed_by_user_id = p_user_id;

  IF v_email IS NOT NULL THEN
    DELETE FROM allowed_emails WHERE LOWER(allowed_emails.email) = LOWER(v_email);
  END IF;

  RETURN QUERY
  DELETE FROM users WHERE users.id = p_user_id
  RETURNING users.id, users.email::text;
END;
$$;

REVOKE ALL ON FUNCTION admin_delete_user(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_delete_user(integer) TO causal_app;
