-- 195: Caught during Phase 2 verification against real demo-company data, not a clean org --
-- demo-company already had extensive pre-existing source='csv' org_actuals rows (seed data)
-- before this session flipped it to actuals_source='ledger'. org_ledger_recompute_actuals_for_
-- period() (migration 192) only ever INSERTed new source='ledger' rows and cleared its own
-- prior 'ledger' rows -- it never touched pre-existing 'xero'/'csv' rows for that same
-- org/period. Result: OrganizationalBudgetByProgram.js (an actual, unmodified report) summed
-- BOTH the old csv row and the new ledger row for the same account/program/period cell -- a
-- direct violation of "reporting never blends both sources for the same period," which is the
-- one hard rule this whole bridge exists to uphold.
--
-- The writer-match guard trigger (org_enforce_actuals_source_writer) only stops NEW writes from
-- the wrong source going forward; it does nothing about rows already sitting there from before
-- an org's actuals_source flip. This closes that gap at the one place it can be closed without
-- touching xero/csv import code: when the ledger writer is about to post rows for a given
-- org/period, it now also purges any non-ledger rows for that exact org/period first. Other
-- periods (ones the ledger has no data for -- e.g. FY2025 history from before a mid-year
-- cutover) are left untouched, so historical Xero-sourced actuals survive a cutover instead of
-- being wiped wholesale; only the specific periods the ledger is actually authoritative for get
-- cleared of the source it's superseding.

CREATE OR REPLACE FUNCTION org_ledger_recompute_actuals_for_period(
  p_org_id integer, p_period_year integer, p_period_month integer
) RETURNS void AS $$
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

  -- The ledger is authoritative for this org/period now -- clear whatever the old writer(s)
  -- left behind here before writing fresh ledger rows, so the two can never coexist for the
  -- same org/period the way they briefly did during this verification pass.
  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source IN ('xero', 'csv');

  INSERT INTO org_actuals (
    org_id, status, source, dedupe_key, period_year, period_month,
    description, currency_code, amount_cents, xero_tracking_option_id,
    coop_account_id, coop_program_id, grant_id,
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
$$ LANGUAGE plpgsql;

-- Same gap exists in the other direction, closed here too: an org that flips actuals_source
-- BACK from 'ledger' to 'xero'/'csv' should have its ledger-sourced rows cleared for periods
-- the ledger had written to, not leave them sitting there uncleared while the old writer
-- resumes. org_recompute_actuals_on_source_flip() (migration 193) already calls
-- org_ledger_recompute_actuals_for_period() for every period with ledger transactions on any
-- flip in either direction, and that function's first DELETE (source='ledger', unconditional,
-- above) already handles this -- no separate fix needed here, noting it for completeness since
-- it wasn't obvious without tracing both flip directions through explicitly.
