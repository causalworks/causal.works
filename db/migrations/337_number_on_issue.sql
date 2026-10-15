-- Document numbers are assigned when an invoice is sent or a bill is approved, not when the draft is saved.
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
      VALUES (s.org_id, NULL, v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
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
      VALUES (s.org_id, NULL, v_constituent_id, s.next_occurrence_date, CASE WHEN v_due_days IS NULL THEN NULL ELSE s.next_occurrence_date + v_due_days END, v_reference, v_fiscal_year, s.created_by)
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
$function$

;
