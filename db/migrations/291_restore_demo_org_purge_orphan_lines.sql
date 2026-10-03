-- restore_demo_org(): also purge orphaned child lines (ledger/bill/invoice lines have no org_id column,
-- so the reset never covered them). See migration 290's header.

CREATE OR REPLACE FUNCTION public.restore_demo_org()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id integer;
  t text;
  col text;
  tables text[] := demo_org_reset_tables();
  v_restored integer := 0;
BEGIN
  SELECT id INTO v_org_id FROM coop_members WHERE slug = 'demo-company' LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM org_demo_snapshot LIMIT 1) THEN
    RETURN 0; -- never snapshotted yet; nothing to restore against
  END IF;

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I DISABLE TRIGGER ALL', t);
  END LOOP;

  FOREACH t IN ARRAY tables LOOP
    col := demo_org_reset_org_column(t);
    CONTINUE WHEN col IS NULL;

    EXECUTE format('DELETE FROM %I WHERE %I = $1', t, col) USING v_org_id;

    EXECUTE format(
      'INSERT INTO %I SELECT * FROM jsonb_populate_recordset(NULL::%I,
         (SELECT COALESCE(jsonb_agg(row_data), ''[]''::jsonb) FROM org_demo_snapshot WHERE table_name = $1))',
      t, t
    ) USING t;
    GET DIAGNOSTICS v_restored = ROW_COUNT;
  END LOOP;

  DELETE FROM org_audit_log WHERE org_id = v_org_id;

  -- Child tables with no org_id column are never covered by the table loop above, so lines that
  -- belonged to a visitor's now-deleted bills/invoices/transactions would otherwise pile up
  -- nightly (found 2026-10-03: 26 orphan ledger lines). Purge only lines whose parent is gone.
  DELETE FROM org_ledger_lines l WHERE NOT EXISTS (SELECT 1 FROM org_ledger_transactions t WHERE t.id = l.transaction_id);
  DELETE FROM org_bill_lines l WHERE NOT EXISTS (SELECT 1 FROM org_bills b WHERE b.id = l.bill_id);
  DELETE FROM org_invoice_lines l WHERE NOT EXISTS (SELECT 1 FROM org_invoices i WHERE i.id = l.invoice_id);

  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;

  RETURN v_restored;
EXCEPTION WHEN OTHERS THEN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE TRIGGER ALL', t);
  END LOOP;
  RAISE;
END;
$function$;
