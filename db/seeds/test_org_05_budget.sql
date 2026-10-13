-- Test org "Tidal Shift" (slug tidal-shift): FY2026 approved budget.
-- Section 5: budget lines built from the org's own FY2026 actuals (seeds 01 to 04 must have run), so the Budget tab
-- shows an approved budget next to actuals instead of zeros. One line per account, program and month; the monthly
-- amount is the January to September average of the actuals, nudged by a fixed 0.88 to 1.12 factor per account and
-- program (so some lines run over or under budget), rounded to the nearest $100. Re-runnable: it replaces only the
-- manual FY2026 budget lines of this org and touches nothing else. Run via stdin as postgres:
--   sudo -u postgres psql causal_db < db/seeds/test_org_05_budget.sql

DO $seed$
DECLARE
  v_org int;
  v_fy  int := 2026;
  v_n   int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  IF v_org IS NULL THEN RAISE EXCEPTION 'tidal-shift not found; run seeds 01 to 04 first'; END IF;

  DELETE FROM org_budget_lines WHERE org_id = v_org AND fiscal_year = v_fy AND source_type = 'manual';

  INSERT INTO org_budget_lines (org_id, account_id, program_id, grant_id, fiscal_year, month, amount_cents, source_type)
  SELECT v_org, t.account_id, t.program_id, NULL, v_fy, m.month, t.monthly_cents, 'manual'
    FROM (
      SELECT a.org_account_id AS account_id, a.org_program_id AS program_id,
             (ROUND((SUM(a.amount_cents) FILTER (WHERE a.period_month <= 9) / 9.0)
                    * (0.88 + ((a.org_account_id * 7 + a.org_program_id * 3) % 25) / 100.0) / 10000.0) * 10000)::bigint AS monthly_cents
        FROM org_actuals a
        JOIN org_accounts acc ON acc.id = a.org_account_id AND acc.is_posting AND acc.type IN ('income', 'expense')
       WHERE a.org_id = v_org AND a.period_year = v_fy AND a.status = 'confirmed' AND a.org_program_id IS NOT NULL
       GROUP BY a.org_account_id, a.org_program_id
    ) t
    CROSS JOIN generate_series(1, 12) AS m(month)
   WHERE t.monthly_cents > 0;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'tidal-shift FY% budget lines inserted: %', v_fy, v_n;
END
$seed$;
