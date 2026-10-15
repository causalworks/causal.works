-- Invoice and bill numbers: one sequence per organization per document type, plus default payment terms

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS invoice_number_prefix text NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS invoice_next_number integer NOT NULL DEFAULT 1 CHECK (invoice_next_number >= 1),
  ADD COLUMN IF NOT EXISTS bill_number_prefix text NOT NULL DEFAULT 'BILL-',
  ADD COLUMN IF NOT EXISTS bill_next_number integer NOT NULL DEFAULT 1 CHECK (bill_next_number >= 1),
  ADD COLUMN IF NOT EXISTS default_invoice_terms_days integer CHECK (default_invoice_terms_days IS NULL OR default_invoice_terms_days BETWEEN 0 AND 365),
  ADD COLUMN IF NOT EXISTS default_bill_terms_days integer CHECK (default_bill_terms_days IS NULL OR default_bill_terms_days BETWEEN 0 AND 365);

ALTER TABLE org_invoices ADD COLUMN IF NOT EXISTS invoice_number text;
ALTER TABLE org_bills ADD COLUMN IF NOT EXISTS bill_number text;

CREATE OR REPLACE FUNCTION org_take_document_number(p_org_id integer, p_kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_n integer;
BEGIN
  IF p_kind = 'invoice' THEN
    UPDATE org_settings SET invoice_next_number = invoice_next_number + 1
      WHERE org_id = p_org_id RETURNING invoice_number_prefix, invoice_next_number - 1 INTO v_prefix, v_n;
  ELSIF p_kind = 'bill' THEN
    UPDATE org_settings SET bill_next_number = bill_next_number + 1
      WHERE org_id = p_org_id RETURNING bill_number_prefix, bill_next_number - 1 INTO v_prefix, v_n;
  ELSE
    RAISE EXCEPTION 'unknown document kind %', p_kind;
  END IF;
  IF v_n IS NULL THEN RETURN NULL; END IF;
  RETURN v_prefix || lpad(v_n::text, 4, '0');
END;
$$;

ALTER TABLE org_invoices DISABLE TRIGGER USER;
ALTER TABLE org_bills DISABLE TRIGGER USER;

WITH n AS (SELECT id, org_id, row_number() OVER (PARTITION BY org_id ORDER BY id) AS rn FROM org_invoices)
UPDATE org_invoices i SET invoice_number = s.invoice_number_prefix || lpad(n.rn::text, 4, '0')
  FROM n JOIN org_settings s ON s.org_id = n.org_id WHERE i.id = n.id AND i.invoice_number IS NULL;
UPDATE org_settings s SET invoice_next_number = c.cnt + 1
  FROM (SELECT org_id, count(*) AS cnt FROM org_invoices GROUP BY org_id) c WHERE s.org_id = c.org_id;

WITH n AS (SELECT id, org_id, row_number() OVER (PARTITION BY org_id ORDER BY id) AS rn FROM org_bills)
UPDATE org_bills b SET bill_number = s.bill_number_prefix || lpad(n.rn::text, 4, '0')
  FROM n JOIN org_settings s ON s.org_id = n.org_id WHERE b.id = n.id AND b.bill_number IS NULL;
UPDATE org_settings s SET bill_next_number = c.cnt + 1
  FROM (SELECT org_id, count(*) AS cnt FROM org_bills GROUP BY org_id) c WHERE s.org_id = c.org_id;

ALTER TABLE org_invoices ENABLE TRIGGER USER;
ALTER TABLE org_bills ENABLE TRIGGER USER;

CREATE UNIQUE INDEX IF NOT EXISTS org_invoices_number_unique ON org_invoices (org_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS org_bills_number_unique ON org_bills (org_id, bill_number) WHERE bill_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.org_run_due_recurring_schedules()
 RETURNS TABLE(schedule_id integer, generated_kind text, generated_id integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  v_constituent_id integer;
  v_reference text;
  v_line jsonb;
  v_fiscal_year integer;
  v_new_id integer;
  v_next date;
  v_due_days integer;
BEGIN
  FOR s IN
    SELECT * FROM org_recurring_schedules
    WHERE active IS TRUE AND next_occurrence_date <= CURRENT_DATE
    ORDER BY id
  LOOP
    v_constituent_id := (s.template->>'constituent_id')::integer;
    v_reference := s.template->>'reference';
    v_fiscal_year := org_fiscal_year_for_date(s.org_id, s.next_occurrence_date);
    v_due_days := NULLIF(s.template->>'due_days', '')::integer;

    IF s.schedule_type = 'bill' THEN
      INSERT INTO org_bills (org_id, bill_number, constituent_id, bill_date, due_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, org_take_document_number(s.org_id, 'bill'), v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents, line_memo)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          NULLIF(v_line->>'grant_id', '')::integer,
          (v_line->>'amount_cents')::bigint,
          NULLIF(v_line->>'description', '')
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'bill'; generated_id := v_new_id;
      RETURN NEXT;

    ELSIF s.schedule_type = 'invoice' THEN
      INSERT INTO org_invoices (org_id, invoice_number, constituent_id, invoice_date, due_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, org_take_document_number(s.org_id, 'invoice'), v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_invoice_lines (invoice_id, account_id, program_id, description, unit_amount_cents, fair_market_value_cents)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          v_line->>'description',
          (v_line->>'unit_amount_cents')::bigint,
          NULLIF(v_line->>'fair_market_value_cents', '')::bigint
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'invoice'; generated_id := v_new_id;
      RETURN NEXT;
    END IF;

    v_next := org_next_recurring_occurrence(s.next_occurrence_date, s.frequency, s.active_months);
    UPDATE org_recurring_schedules
      SET next_occurrence_date = v_next,
          active = (s.end_date IS NULL OR v_next <= s.end_date),
          updated_at = NOW()
      WHERE id = s.id;
  END LOOP;
  RETURN;
END;
$function$;
