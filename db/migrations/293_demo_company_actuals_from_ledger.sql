-- demo-company: books live in Causal's ledger (2026-10-03). Flipping the setting makes the existing
-- trigger replace the imported (csv) actuals for every month that has posted ledger transactions
-- (Jan-Oct 2026, from migration 290) with ledger-derived actuals; the 2025 csv actuals have no ledger
-- transactions behind them and are kept as prior-year history. Run SELECT snapshot_demo_org(); after.

UPDATE org_settings SET actuals_source = 'ledger'
 WHERE org_id = (SELECT id FROM coop_members WHERE slug = 'demo-company') AND actuals_source <> 'ledger';
