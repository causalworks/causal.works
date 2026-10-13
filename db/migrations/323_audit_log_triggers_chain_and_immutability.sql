-- Audit log: hash chain per org, immutable to the application role, and automatic database-side
-- records of every ledger entry and line change. Rows written by the database use action
-- db_insert / db_update / db_delete so existing screens that read action = 'update' are unaffected.

ALTER TABLE org_audit_log DROP CONSTRAINT org_audit_log_action_check;
ALTER TABLE org_audit_log ADD CONSTRAINT org_audit_log_action_check
  CHECK (action = ANY (ARRAY['create','update','delete','db_insert','db_update','db_delete']));
ALTER TABLE org_audit_log ADD COLUMN IF NOT EXISTS prev_hash text;
ALTER TABLE org_audit_log ADD COLUMN IF NOT EXISTS row_hash text;

CREATE OR REPLACE FUNCTION org_audit_row_hash(p_prev text, r org_audit_log) RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT encode(sha256(convert_to(concat_ws('|',
    coalesce(p_prev, ''), r.org_id::text, coalesce(r.user_id::text, ''), r.action, r.table_name,
    r.record_id::text, coalesce(r.field_name, ''), coalesce(r.old_value, ''), coalesce(r.new_value, ''),
    to_char(r.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), coalesce(r.metadata::text, '')
  ), 'UTF8')), 'hex')
$$;

CREATE OR REPLACE FUNCTION org_audit_log_chain() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prev text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('org_audit_log:' || NEW.org_id::text, 0));
  SELECT row_hash INTO v_prev FROM org_audit_log WHERE org_id = NEW.org_id ORDER BY id DESC LIMIT 1;
  NEW.occurred_at := COALESCE(NEW.occurred_at, now());
  NEW.prev_hash := v_prev;
  NEW.row_hash := org_audit_row_hash(v_prev, NEW);
  RETURN NEW;
END $$;

-- One-time chain of the rows that already exist, before the immutability trigger is created.
DO $$
DECLARE o int; r org_audit_log; v_prev text; v_hash text;
BEGIN
  FOR o IN SELECT DISTINCT org_id FROM org_audit_log LOOP
    v_prev := NULL;
    FOR r IN SELECT * FROM org_audit_log WHERE org_id = o ORDER BY id LOOP
      v_hash := org_audit_row_hash(v_prev, r);
      UPDATE org_audit_log SET prev_hash = v_prev, row_hash = v_hash WHERE id = r.id;
      v_prev := v_hash;
    END LOOP;
  END LOOP;
END $$;

CREATE TRIGGER trg_org_audit_log_chain BEFORE INSERT ON org_audit_log
  FOR EACH ROW EXECUTE FUNCTION org_audit_log_chain();

CREATE OR REPLACE FUNCTION org_audit_log_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR current_user = 'causal_app' THEN
    RAISE EXCEPTION 'org_audit_log rows cannot be changed or deleted by the application';
  END IF;
  RETURN OLD;
END $$;

CREATE TRIGGER trg_org_audit_log_immutable BEFORE UPDATE OR DELETE ON org_audit_log
  FOR EACH ROW EXECUTE FUNCTION org_audit_log_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON org_audit_log FROM causal_app;

-- Returns the first row whose stored hash or link does not match, or no rows when the chain is intact.
CREATE OR REPLACE FUNCTION org_audit_verify(p_org_id integer) RETURNS TABLE(bad_id bigint, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r org_audit_log; v_prev text := NULL;
BEGIN
  FOR r IN SELECT * FROM org_audit_log WHERE org_id = p_org_id ORDER BY id LOOP
    IF r.prev_hash IS DISTINCT FROM v_prev THEN bad_id := r.id; reason := 'link broken'; RETURN NEXT; RETURN; END IF;
    IF r.row_hash IS DISTINCT FROM org_audit_row_hash(v_prev, r) THEN bad_id := r.id; reason := 'content changed'; RETURN NEXT; RETURN; END IF;
    v_prev := r.row_hash;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION org_audit_verify(integer) FROM PUBLIC;

CREATE OR REPLACE FUNCTION org_audit_ledger_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_old jsonb; v_new jsonb; v_src jsonb; v_org integer; v_user integer;
BEGIN
  v_old := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  v_new := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  IF TG_OP = 'UPDATE' AND v_old = v_new THEN RETURN NULL; END IF;
  v_src := COALESCE(v_new, v_old);
  IF TG_TABLE_NAME = 'org_ledger_transactions' THEN
    v_org := (v_src->>'org_id')::integer;
  ELSE
    SELECT org_id INTO v_org FROM org_ledger_transactions WHERE id = (v_src->>'transaction_id')::integer;
  END IF;
  IF v_org IS NULL THEN RETURN NULL; END IF;
  v_user := NULLIF(current_setting('app.current_user_id', true), '')::integer;
  INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, old_value, new_value)
  VALUES (v_org, v_user, 'db_' || lower(TG_OP), TG_TABLE_NAME, (v_src->>'id')::bigint, v_old::text, v_new::text);
  RETURN NULL;
END $$;
REVOKE EXECUTE ON FUNCTION org_audit_ledger_change() FROM PUBLIC;

CREATE TRIGGER trg_org_ledger_transactions_audit AFTER INSERT OR UPDATE OR DELETE ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_audit_ledger_change();
CREATE TRIGGER trg_org_ledger_lines_audit AFTER INSERT OR UPDATE OR DELETE ON org_ledger_lines
  FOR EACH ROW EXECUTE FUNCTION org_audit_ledger_change();

-- Posted entries are voided, never deleted. Cascades from owner-run functions (org deletion) still work.
REVOKE DELETE ON org_ledger_transactions, org_ledger_lines FROM causal_app;
