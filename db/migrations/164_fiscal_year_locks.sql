-- 164: Fiscal year close/lock -- reversible per-org, per-FY lock on financial data.
--
-- An org admin can lock a fiscal year so its budget/schedule/personnel/grant/actuals/balance-
-- sheet data becomes read-only, then reopen it later (with a required reason) for a late audit
-- or tax-return revision -- the lock is a fail-closed DB-level backstop (mirrors how RLS
-- enforces org isolation), not just an app-layer check, but it is explicitly reversible: no
-- hard delete, no permanent state, just a row toggled off and an audit trail of who/when/why.
--
-- Reconciliation (a separate, advisory feature -- see server/organizational/lib/
-- reconciliation.js, added alongside this migration) is NOT a precondition for locking: an org
-- may deliberately lock an imperfect year while external reconciliation is still in flight,
-- exactly the "closing before the audit/tax return is final" case this was built for.

CREATE TABLE org_fiscal_year_locks (
    id SERIAL PRIMARY KEY,
    org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
    fiscal_year integer NOT NULL,
    locked_at timestamp with time zone,
    locked_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    reopened_at timestamp with time zone,
    reopened_by_user_id integer REFERENCES users(id) ON DELETE SET NULL,
    reopen_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (org_id, fiscal_year)
);

ALTER TABLE org_fiscal_year_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_fiscal_year_locks FORCE ROW LEVEL SECURITY;
CREATE POLICY org_fiscal_year_locks_org_isolation ON org_fiscal_year_locks
  USING ((org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));

-- ---------------------------------------------------------------------------
-- Fiscal-year-boundary math in SQL, mirroring server/organizational/lib/fiscalYear.js's
-- fiscalYearForDate() exactly (fiscal_year = calendar year the FY ends in; month <=
-- fiscal_year_end_month belongs to that calendar year's FY, else to FY+1). Needed because
-- org_actuals (period_year/period_month) and org_balance_sheet_snapshots (as_of_date) don't
-- carry a stored fiscal_year column the way the other locked tables do.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_fiscal_year_for_period(p_org_id integer, p_year integer, p_month integer)
RETURNS integer AS $$
DECLARE
  v_fy_end_month integer;
BEGIN
  SELECT COALESCE(fiscal_year_end_month, 12) INTO v_fy_end_month FROM org_settings WHERE org_id = p_org_id;
  IF v_fy_end_month IS NULL THEN v_fy_end_month := 12; END IF;
  IF p_month <= v_fy_end_month THEN
    RETURN p_year;
  ELSE
    RETURN p_year + 1;
  END IF;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION org_fiscal_year_for_date(p_org_id integer, p_date date)
RETURNS integer AS $$
BEGIN
  RETURN org_fiscal_year_for_period(p_org_id, EXTRACT(YEAR FROM p_date)::integer, EXTRACT(MONTH FROM p_date)::integer);
END;
$$ LANGUAGE plpgsql STABLE;

-- ---------------------------------------------------------------------------
-- Trigger functions. Custom SQLSTATE 'CA001' lets application code match on e.code exactly
-- instead of parsing the error message text.
-- ---------------------------------------------------------------------------

-- Direct: table has its own coop_org_id + fiscal_year columns.
CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.coop_org_id, OLD.coop_org_id);
  v_fy := COALESCE(NEW.fiscal_year, OLD.fiscal_year);
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Indirect: table has no own fiscal_year -- inherits it from org_allocation_schedules via
-- coop_allocation_schedule_id (org_allocation_lines, org_allocation_monthly).
CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock_alloc_child() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
  v_schedule_id integer;
BEGIN
  v_schedule_id := COALESCE(NEW.coop_allocation_schedule_id, OLD.coop_allocation_schedule_id);
  SELECT coop_org_id, fiscal_year INTO v_org_id, v_fy
    FROM org_allocation_schedules WHERE id = v_schedule_id;
  IF v_org_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Derived: org_actuals -- fiscal year computed from period_year/period_month.
CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock_actuals() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.coop_org_id, OLD.coop_org_id);
  v_fy := org_fiscal_year_for_period(v_org_id, COALESCE(NEW.period_year, OLD.period_year), COALESCE(NEW.period_month, OLD.period_month));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Derived: org_balance_sheet_snapshots -- fiscal year computed from as_of_date.
CREATE OR REPLACE FUNCTION org_enforce_fiscal_year_lock_balance_sheet() RETURNS trigger AS $$
DECLARE
  v_org_id integer;
  v_fy integer;
  v_locked boolean;
BEGIN
  v_org_id := COALESCE(NEW.coop_org_id, OLD.coop_org_id);
  v_fy := org_fiscal_year_for_date(v_org_id, COALESCE(NEW.as_of_date, OLD.as_of_date));
  SELECT (locked_at IS NOT NULL) INTO v_locked
    FROM org_fiscal_year_locks WHERE org_id = v_org_id AND fiscal_year = v_fy;
  IF v_locked THEN
    RAISE EXCEPTION 'Fiscal year % is locked for this organization; an admin must reopen it before making changes.', v_fy
      USING ERRCODE = 'CA001';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------------
-- Attach triggers. Not locked: org_documents (late audit docs should still upload for a
-- closed year), org_audit_log (append-only), org_fiscal_year_locks itself.
-- ---------------------------------------------------------------------------

CREATE TRIGGER trg_fy_lock_budget_lines BEFORE INSERT OR UPDATE OR DELETE ON org_budget_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_schedule_items BEFORE INSERT OR UPDATE OR DELETE ON org_schedule_items
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_personnel BEFORE INSERT OR UPDATE OR DELETE ON org_personnel
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_grant_allocations BEFORE INSERT OR UPDATE OR DELETE ON org_grant_allocations
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_projections BEFORE INSERT OR UPDATE OR DELETE ON org_projections
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();
CREATE TRIGGER trg_fy_lock_allocation_schedules BEFORE INSERT OR UPDATE OR DELETE ON org_allocation_schedules
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock();

CREATE TRIGGER trg_fy_lock_allocation_lines BEFORE INSERT OR UPDATE OR DELETE ON org_allocation_lines
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_alloc_child();
CREATE TRIGGER trg_fy_lock_allocation_monthly BEFORE INSERT OR UPDATE OR DELETE ON org_allocation_monthly
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_alloc_child();

CREATE TRIGGER trg_fy_lock_actuals BEFORE INSERT OR UPDATE OR DELETE ON org_actuals
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_actuals();

CREATE TRIGGER trg_fy_lock_balance_sheet BEFORE INSERT OR UPDATE OR DELETE ON org_balance_sheet_snapshots
  FOR EACH ROW EXECUTE FUNCTION org_enforce_fiscal_year_lock_balance_sheet();
