-- Make the internal ledger the default source of actuals (2026-10-03).
-- Causal's own accounting module is the default for new organizations; Xero is an optional
-- integration an org chooses. Previously the column default and three DB functions all assumed 'xero'
-- when an org had no explicit setting, so every new org started Xero-sourced and its financial
-- statements read 'not available'.
-- Existing orgs: only those with no Xero connection and no imported actuals are switched here (an org
-- that already holds imported actuals keeps its setting until its admin or an operator changes it).
-- demo-company is switched in 293.

ALTER TABLE org_settings ALTER COLUMN actuals_source SET DEFAULT 'ledger';

UPDATE org_settings s SET actuals_source = 'ledger'
 WHERE s.actuals_source = 'xero' AND s.xero_tenant_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM org_actuals a WHERE a.org_id = s.org_id);

CREATE OR REPLACE FUNCTION public.org_enforce_actuals_source_writer()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'ledger') INTO v_actuals_source
    FROM org_settings WHERE org_id = NEW.org_id;
  IF v_actuals_source IS NULL THEN
    v_actuals_source := 'ledger';
  END IF;

  IF NEW.source = 'ledger' AND v_actuals_source <> 'ledger' THEN
    RAISE EXCEPTION 'org % has actuals_source=%, cannot accept a source=ledger org_actuals row', NEW.org_id, v_actuals_source
      USING ERRCODE = '23514';
  END IF;

  IF NEW.source IN ('xero', 'csv') AND v_actuals_source <> 'xero' THEN
    RAISE EXCEPTION 'org % has actuals_source=%, cannot accept a source=% org_actuals row', NEW.org_id, v_actuals_source, NEW.source
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.org_ledger_recompute_actuals_for_period(p_org_id integer, p_period_year integer, p_period_month integer)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'ledger') INTO v_actuals_source FROM org_settings WHERE org_id = p_org_id;

  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source = 'ledger';

  IF v_actuals_source IS DISTINCT FROM 'ledger' THEN
    RETURN;
  END IF;

  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source IN ('xero', 'csv');

  INSERT INTO org_actuals (
    org_id, status, source, dedupe_key, period_year, period_month,
    description, currency_code, amount_cents, xero_tracking_option_id,
    org_account_id, org_program_id, grant_id,
    auto_matched_account, auto_matched_program, auto_matched_activity
  )
  SELECT
    p_org_id,
    'confirmed'::org_actual_status,
    'ledger',
    'ledger:' || p_period_year || '-' || p_period_month || ':' || l.account_id || ':' || l.program_id
      || ':' || COALESCE(l.grant_id::text, 'none'),
    p_period_year,
    p_period_month,
    MAX(a.name),
    'USD',
    CASE WHEN a.type = 'expense'::org_account_type
         THEN SUM(l.debit_cents) - SUM(l.credit_cents)
         ELSE SUM(l.credit_cents) - SUM(l.debit_cents)
    END AS amount_cents,
    'ledger:' || l.program_id || ':' || COALESCE(l.grant_id::text, 'none'),
    l.account_id,
    l.program_id,
    l.grant_id,
    FALSE, FALSE, FALSE
  FROM org_ledger_lines l
  JOIN org_ledger_transactions t ON t.id = l.transaction_id
  JOIN org_accounts a ON a.id = l.account_id
  WHERE t.org_id = p_org_id AND t.status = 'posted'
    AND t.transaction_date >= make_date(p_period_year, p_period_month, 1)
    AND t.transaction_date < (make_date(p_period_year, p_period_month, 1) + interval '1 month')
    AND a.type IN ('income'::org_account_type, 'expense'::org_account_type)
  GROUP BY l.account_id, l.program_id, l.grant_id, a.type
  HAVING (CASE WHEN a.type = 'expense'::org_account_type
               THEN SUM(l.debit_cents) - SUM(l.credit_cents)
               ELSE SUM(l.credit_cents) - SUM(l.debit_cents)
          END) <> 0;
END;
$function$;

