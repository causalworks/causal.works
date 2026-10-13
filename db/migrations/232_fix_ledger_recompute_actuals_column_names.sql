-- Migration 232: Fix stale column names in org_ledger_recompute_actuals_for_period
-- The function was written before the NP→coop column rename and still references
-- coop_account_id / coop_program_id, which do not exist on org_actuals.
-- The correct column names are org_account_id / org_program_id.

CREATE OR REPLACE FUNCTION org_ledger_recompute_actuals_for_period(
  p_org_id integer,
  p_period_year integer,
  p_period_month integer
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'xero') INTO v_actuals_source FROM org_settings WHERE org_id = p_org_id;

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
$$;
