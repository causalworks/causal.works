-- Row changes on audited tables are recorded by the database in the same transaction as the change.
-- A failed audit write fails the change. Columns named as trigger arguments are left out of the record.

CREATE OR REPLACE FUNCTION org_audit_row_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_src jsonb; v_org integer; v_user integer; v_col text;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  FOREACH v_col IN ARRAY COALESCE(TG_ARGV, ARRAY[]::text[]) LOOP
    v_old := v_old - v_col;
    v_new := v_new - v_col;
  END LOOP;
  IF TG_OP = 'UPDATE' AND (v_old - 'updated_at') = (v_new - 'updated_at') THEN RETURN NULL; END IF;
  v_src := COALESCE(v_new, v_old);
  v_org := (v_src->>'org_id')::integer;
  IF v_org IS NULL OR NOT EXISTS (SELECT 1 FROM coop_members WHERE id = v_org) THEN RETURN NULL; END IF;
  v_user := NULLIF(current_setting('app.current_user_id', true), '')::integer;
  INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_org, v_user, 'db_' || lower(TG_OP), TG_TABLE_NAME, (v_src->>'id')::bigint, v_old::text, v_new::text);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION org_audit_row_change() FROM PUBLIC;

CREATE TRIGGER trg_org_personnel_audit AFTER INSERT OR UPDATE OR DELETE ON org_personnel
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_fringe_settings_audit AFTER INSERT OR UPDATE OR DELETE ON org_fringe_settings
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_board_designations_audit AFTER INSERT OR UPDATE OR DELETE ON org_board_designations
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_bank_rules_audit AFTER INSERT OR UPDATE OR DELETE ON org_bank_rules
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_recurring_schedules_audit AFTER INSERT OR UPDATE OR DELETE ON org_recurring_schedules
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_fixed_assets_audit AFTER INSERT OR UPDATE OR DELETE ON org_fixed_assets
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_functional_classifications_audit AFTER INSERT OR UPDATE OR DELETE ON org_functional_classifications
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
CREATE TRIGGER trg_org_plaid_items_audit AFTER INSERT OR UPDATE OR DELETE ON org_plaid_items
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change('access_token', 'cursor');
CREATE TRIGGER trg_org_plaid_accounts_audit AFTER INSERT OR UPDATE OR DELETE ON org_plaid_accounts
  FOR EACH ROW EXECUTE FUNCTION org_audit_row_change();
