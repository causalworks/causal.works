-- 192: Ledger module V1, Phase 2 -- single-writer bridge from org_ledger_transactions/
-- org_ledger_lines into the existing org_actuals table. See Ledger_Module_V1_Spec.md Section 2.
--
-- Nothing here touches server/organizational/xero/import-pl-actuals.js, routes/imports.js
-- (CSV import), or any report read path -- every existing writer and every existing reader of
-- org_actuals is byte-for-byte unchanged. The single new writer, and the guard that keeps it
-- from colliding with the existing two, are both implemented as triggers/functions living
-- entirely on the DB side.
--
-- Scope note: this bridges P&L actuals only (income/expense accounts), matching exactly what
-- the existing Xero PL importer already covers -- balance-sheet-side ledger activity (asset/
-- liability/equity accounts) is out of scope here, same as it's out of scope for
-- import-pl-actuals.js today (that goes through the separate org_balance_sheet_snapshots path,
-- which this phase was not asked to bridge). Flagging as a known gap for a future phase, not
-- silently expanding scope to cover it now.
--
-- Cadence decision: recompute runs continuously (on every ledger transaction post/void), not
-- only at fiscal-year lock time. org_fiscal_year_locks operates at whole-fiscal-year grain, but
-- org_actuals/budget-vs-actual reporting is monthly -- gating writes on the year lock would mean
-- 11 of 12 months show zero actuals for a ledger-sourced org until the year closes, defeating
-- the point of bridging into budget-vs-actual at all. Locking still matters here, just
-- indirectly: once a fiscal year is locked, migration 191's existing triggers already block any
-- further org_ledger_transactions/org_ledger_lines writes for that year, so the recompute simply
-- has nothing new to react to -- no separate freeze mechanism needed.

-- ---------------------------------------------------------------------------
-- 1. Writer-match guard on org_actuals itself -- enforces the single-writer rule in both
--    directions without touching either existing writer's code. A currently-live org (default
--    actuals_source='xero') sees zero behavior change: xero/csv writes already only ever
--    happen with actuals_source='xero', so the guard is a no-op until an org actually flips.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_enforce_actuals_source_writer() RETURNS trigger AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'xero') INTO v_actuals_source
    FROM org_settings WHERE org_id = NEW.org_id;
  IF v_actuals_source IS NULL THEN
    v_actuals_source := 'xero';
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
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_org_actuals_writer_guard
  BEFORE INSERT OR UPDATE OF source, org_id ON org_actuals
  FOR EACH ROW EXECUTE FUNCTION org_enforce_actuals_source_writer();

-- ---------------------------------------------------------------------------
-- 2. Aggregation function -- recomputes this org/period's source='ledger' org_actuals rows
--    from posted (non-voided) org_ledger_lines, income/expense accounts only. Callable directly
--    (e.g. for a manual backfill) and invoked automatically by the triggers below.
--
--    Grain matches the existing idx_org_actuals_period_cell_unique index exactly
--    (org_id, coop_account_id, period_year, period_month, tracking-option-or-'none'):
--    xero_tracking_option_id is reused as a synthetic differentiator ('ledger:<program>:<grant>')
--    the same way routes/imports.js's CSV path already reuses it as a plain uniqueness key
--    ('csv:<ref>') unrelated to any real Xero tracking category -- this is an established
--    pattern on this column, not a new one. Without it, every ledger org would be limited to one
--    program per account per period, which would silently break OrganizationalBudgetByProgram.js
--    (a real report that groups org_actuals by coop_program_id).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_ledger_recompute_actuals_for_period(
  p_org_id integer, p_period_year integer, p_period_month integer
) RETURNS void AS $$
DECLARE
  v_actuals_source text;
BEGIN
  SELECT COALESCE(actuals_source, 'xero') INTO v_actuals_source FROM org_settings WHERE org_id = p_org_id;

  -- Always clear this org/period's prior ledger-sourced rows first, so a no-op below (org not
  -- on the ledger writer) still removes rows a since-reverted actuals_source flip left behind,
  -- rather than leaving them stale.
  DELETE FROM org_actuals
   WHERE org_id = p_org_id AND period_year = p_period_year AND period_month = p_period_month
     AND source = 'ledger';

  IF v_actuals_source IS DISTINCT FROM 'ledger' THEN
    RETURN;
  END IF;

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

-- ---------------------------------------------------------------------------
-- 3. Triggers -- keep org_actuals continuously current as ledger transactions post or void.
--    Line changes use a deferred constraint trigger (fires once per commit, after every line in
--    a multi-line INSERT is in place, same idiom as migration 191's balance check). Voiding a
--    transaction doesn't touch its lines, so that gets its own plain AFTER UPDATE trigger.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION org_trigger_recompute_actuals_from_ledger_lines() RETURNS trigger AS $$
DECLARE
  v_transaction_id integer;
  v_org_id integer;
  v_period_year integer;
  v_period_month integer;
BEGIN
  v_transaction_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT org_id, EXTRACT(YEAR FROM transaction_date)::integer, EXTRACT(MONTH FROM transaction_date)::integer
    INTO v_org_id, v_period_year, v_period_month
    FROM org_ledger_transactions WHERE id = v_transaction_id;
  IF v_org_id IS NOT NULL THEN
    PERFORM org_ledger_recompute_actuals_for_period(v_org_id, v_period_year, v_period_month);
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_ledger_lines_recompute_actuals
  AFTER INSERT OR UPDATE OR DELETE ON org_ledger_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION org_trigger_recompute_actuals_from_ledger_lines();

CREATE OR REPLACE FUNCTION org_trigger_recompute_actuals_from_ledger_void() RETURNS trigger AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM org_ledger_recompute_actuals_for_period(
      NEW.org_id,
      EXTRACT(YEAR FROM NEW.transaction_date)::integer,
      EXTRACT(MONTH FROM NEW.transaction_date)::integer
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_transactions_recompute_actuals_on_void
  AFTER UPDATE OF status ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_trigger_recompute_actuals_from_ledger_void();

-- Known limitation, not fixed here: two ledger transactions for the same org+period committing
-- concurrently each run their own DELETE+INSERT recompute pass; Postgres row locking makes this
-- safe from corruption (one waits on the other), not from doing the same recompute work twice.
-- Acceptable for V1 (ledger posting is a low-frequency, single-actor-at-a-time operation in
-- every org this will run against); revisit with an advisory lock keyed on (org_id, period) if
-- posting volume ever makes this a real contention point.
