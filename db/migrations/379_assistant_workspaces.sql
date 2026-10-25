-- 379: lists workspaces whose assistant is on, for the scheduled proposal job (which runs without an organization context).

CREATE OR REPLACE FUNCTION org_assistant_workspaces()
  RETURNS TABLE (org_id integer)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id
    FROM coop_members c JOIN org_settings s ON s.org_id = c.id
   WHERE s.assistant_mode <> 'off' AND c.deleted_at IS NULL
   ORDER BY c.id;
$$;
REVOKE ALL ON FUNCTION org_assistant_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_assistant_workspaces() TO causal_app;
