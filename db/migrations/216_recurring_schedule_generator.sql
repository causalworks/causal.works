-- 216: Purchases/Sales V1, Section 5 (the generator itself). org_recurring_schedules
-- (migration 205) was schema-only -- nothing ever read next_occurrence_date or generated a
-- real bill/invoice from a template. This is a genuine cross-org batch job (like
-- admin_delete_org), so it needs to be SECURITY DEFINER: org_recurring_schedules and
-- org_bills/org_invoices are all FORCE ROW LEVEL SECURITY, scoped to app.current_org_id, and a
-- nightly job has no single org's session context to run under.
--
-- template jsonb shape (documented on org_recurring_schedules.template already):
--   bill:    {"constituent_id": N, "reference": "...", "lines": [{"account_id","program_id","grant_id","amount_cents"}, ...]}
--   invoice: {"constituent_id": N, "reference": "...", "lines": [{"account_id","program_id","description","unit_amount_cents","fair_market_value_cents"}, ...]}
-- Generated documents land in Draft, same as any other bill/invoice -- the generator does not
-- submit or approve/send on anyone's behalf, matching the rest of this system's "nothing posts
-- itself without a human action" posture (the one exception, the federal-award gate, has no
-- bearing here since Draft never touches the ledger).

CREATE FUNCTION org_next_recurring_occurrence(p_current date, p_frequency text, p_active_months smallint[]) RETURNS date AS $$
DECLARE
  v_month smallint;
  v_year integer;
  v_candidate smallint;
BEGIN
  IF p_frequency = 'monthly' THEN
    RETURN (p_current + interval '1 month')::date;
  ELSIF p_frequency = 'quarterly' THEN
    RETURN (p_current + interval '3 months')::date;
  ELSIF p_frequency = 'annual' THEN
    RETURN (p_current + interval '1 year')::date;
  ELSIF p_frequency = 'custom_months' THEN
    v_month := EXTRACT(MONTH FROM p_current)::smallint;
    v_year := EXTRACT(YEAR FROM p_current)::integer;
    SELECT MIN(m) INTO v_candidate FROM unnest(p_active_months) AS m WHERE m > v_month;
    IF v_candidate IS NOT NULL THEN
      RETURN make_date(v_year, v_candidate, LEAST(EXTRACT(DAY FROM p_current)::integer, 28));
    END IF;
    SELECT MIN(m) INTO v_candidate FROM unnest(p_active_months) AS m;
    RETURN make_date(v_year + 1, COALESCE(v_candidate, 1), LEAST(EXTRACT(DAY FROM p_current)::integer, 28));
  ELSE
    RETURN (p_current + interval '1 month')::date;
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE FUNCTION org_run_due_recurring_schedules() RETURNS TABLE(schedule_id integer, generated_kind text, generated_id integer)
    LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  s RECORD;
  v_constituent_id integer;
  v_reference text;
  v_line jsonb;
  v_fiscal_year integer;
  v_new_id integer;
  v_next date;
BEGIN
  FOR s IN
    SELECT * FROM org_recurring_schedules
    WHERE active IS TRUE AND next_occurrence_date <= CURRENT_DATE
    ORDER BY id
  LOOP
    v_constituent_id := (s.template->>'constituent_id')::integer;
    v_reference := s.template->>'reference';
    v_fiscal_year := org_fiscal_year_for_date(s.org_id, s.next_occurrence_date);

    IF s.schedule_type = 'bill' THEN
      INSERT INTO org_bills (org_id, constituent_id, bill_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, v_constituent_id, s.next_occurrence_date, v_reference, v_fiscal_year, s.created_by)
      RETURNING id INTO v_new_id;

      FOR v_line IN SELECT * FROM jsonb_array_elements(COALESCE(s.template->'lines', '[]'::jsonb))
      LOOP
        INSERT INTO org_bill_lines (bill_id, account_id, program_id, grant_id, amount_cents)
        VALUES (
          v_new_id,
          (v_line->>'account_id')::integer,
          (v_line->>'program_id')::integer,
          NULLIF(v_line->>'grant_id', '')::integer,
          (v_line->>'amount_cents')::bigint
        );
      END LOOP;

      schedule_id := s.id; generated_kind := 'bill'; generated_id := v_new_id;
      RETURN NEXT;

    ELSIF s.schedule_type = 'invoice' THEN
      INSERT INTO org_invoices (org_id, constituent_id, invoice_date, reference, fiscal_year, created_by)
      VALUES (s.org_id, v_constituent_id, s.next_occurrence_date, v_reference, v_fiscal_year, s.created_by)
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
$$;
