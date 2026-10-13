-- 193: Caught during Phase 2 verification (mirrors the codebase's own convention of a same-day
-- follow-up migration for issues found while verifying, e.g. 144/145) -- migration 192's
-- recompute only fires on org_ledger_transactions/org_ledger_lines writes. An org that posts
-- ledger transactions for a period *before* flipping org_settings.actuals_source to 'ledger'
-- would have that period silently missing from org_actuals until something else (a new
-- transaction, a void) happens to touch it again. The natural workflow is "flip the source,
-- then post" so this mostly wouldn't bite -- but it's a real gap in what "single writer" claims
-- to guarantee, not a hypothetical one, so closing it here rather than leaving it as a footnote.
--
-- Fix: when actuals_source changes on org_settings (either direction), recompute every period
-- that already has org_ledger_transactions for that org -- covers both "had ledger data,
-- flipped to ledger late" and "flipped away from ledger, needs those rows cleared."

CREATE OR REPLACE FUNCTION org_recompute_actuals_on_source_flip() RETURNS trigger AS $$
DECLARE
  r record;
BEGIN
  IF NEW.actuals_source IS DISTINCT FROM OLD.actuals_source THEN
    FOR r IN
      SELECT DISTINCT EXTRACT(YEAR FROM transaction_date)::integer AS period_year,
                       EXTRACT(MONTH FROM transaction_date)::integer AS period_month
      FROM org_ledger_transactions
      WHERE org_id = NEW.org_id
    LOOP
      PERFORM org_ledger_recompute_actuals_for_period(NEW.org_id, r.period_year, r.period_month);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_settings_recompute_actuals_on_source_flip
  AFTER UPDATE OF actuals_source ON org_settings
  FOR EACH ROW EXECUTE FUNCTION org_recompute_actuals_on_source_flip();
