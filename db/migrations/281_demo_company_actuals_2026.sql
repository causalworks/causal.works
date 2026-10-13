-- 281: Demo Company had a full 2025 of actuals but only June of 2026, so the dashboard's YTD
-- figures were nearly empty and the "last synced" date read June 17. Fill Jan-Sep 2026 (same
-- accounts and pattern as 2025, scaled to land near the 2026 budget) and set the cash figures the Months-of-cash tile reads.
-- Re-run SELECT snapshot_demo_org() afterwards or the nightly reset restores the old state.

INSERT INTO org_actuals (org_id, status, source, dedupe_key, period_year, period_month, description, currency_code,
                         amount_cents, tracking, org_account_id, org_program_id, auto_matched_account, auto_matched_program,
                         raw, xero_tracking_option_id, org_activity_id, auto_matched_activity, grant_id)
SELECT a.org_id, 'confirmed', 'csv', 'demo-2026-' || a.id, 2026, a.period_month, a.description, a.currency_code,
       round(a.amount_cents * 0.572), a.tracking, a.org_account_id, a.org_program_id, a.auto_matched_account, a.auto_matched_program,
       a.raw, a.xero_tracking_option_id, a.org_activity_id, a.auto_matched_activity, a.grant_id
FROM org_actuals a
WHERE a.org_id = 42 AND a.period_year = 2025 AND a.period_month BETWEEN 1 AND 9 AND a.period_month <> 6
ON CONFLICT DO NOTHING;

UPDATE org_settings
   SET org_profile_data = COALESCE(org_profile_data, '{}'::jsonb) || '{"runway_months": 7.4, "cash_balance_cents": 21400000}'::jsonb
 WHERE org_id = 42;

-- Seeded rows read as synced a few days ago (not "just now"), and the cached AI summary was
-- built from the old June-only data, so clear it to regenerate.
UPDATE org_actuals SET created_at = now() - interval '3 days', updated_at = now() - interval '3 days'
 WHERE org_id = 42 AND dedupe_key LIKE 'demo-2026-%';
UPDATE org_settings SET ai_summary_text = NULL, ai_summary_generated_at = NULL, ai_summary_fiscal_year = NULL WHERE org_id = 42;
