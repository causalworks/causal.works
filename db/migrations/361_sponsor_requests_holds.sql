-- Sponsorship: payment requests, project holds, two-person approval, balance overrides, recalls, and the overdue-report hold.

-- Project status values and hold fields
ALTER TABLE org_sponsored_projects DROP CONSTRAINT IF EXISTS org_sponsored_projects_status_check;
ALTER TABLE org_sponsored_projects ADD CONSTRAINT org_sponsored_projects_status_check CHECK (status = ANY (ARRAY[
  'applicant', 'accepted', 'active', 'on_hold', 'winding_down', 'ended', 'lapsed', 'paused', 'completed']));
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS hold_reason text;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS hold_kind text CHECK (hold_kind IS NULL OR hold_kind IN ('manual', 'report_overdue'));
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS hold_set_by integer;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS hold_set_at timestamptz;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS status_before_hold text;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS report_hold_waived_for date;

-- Disbursements: request link, second approval, balance override
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS payment_request_id integer;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS first_approved_by integer;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS first_approved_at timestamptz;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS override_reason text;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS override_by integer;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS override_at timestamptz;

-- Payment requests
CREATE TABLE IF NOT EXISTS org_sponsor_payment_requests (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  requester_link_ref      text,
  payee_constituent_id    integer NOT NULL REFERENCES org_constituents(id),
  amount_cents            bigint NOT NULL CHECK (amount_cents > 0),
  purpose                 text NOT NULL,
  method                  text NOT NULL DEFAULT 'check' CHECK (method IN ('check', 'bank_transfer', 'wire', 'card', 'other')),
  document_id             integer REFERENCES org_documents(id) ON DELETE SET NULL,
  budget_line             text,
  needed_by               date,
  status                  text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'needs_info', 'approved', 'rejected', 'withdrawn')),
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  reviewer_id             integer,
  reviewed_at             timestamptz,
  decision_reason         text,
  override_reason         text,
  override_by             integer,
  override_at             timestamptz,
  disbursement_id         integer REFERENCES org_sponsored_project_disbursements(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS org_sponsor_payment_requests_project_idx ON org_sponsor_payment_requests (sponsored_project_id, status);

ALTER TABLE org_sponsor_payment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_payment_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_payment_requests_org_isolation ON org_sponsor_payment_requests;
CREATE POLICY org_sponsor_payment_requests_org_isolation ON org_sponsor_payment_requests
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_sponsor_payment_requests_program_scope ON org_sponsor_payment_requests;
CREATE POLICY org_sponsor_payment_requests_program_scope ON org_sponsor_payment_requests AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR EXISTS (
    SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())));
GRANT SELECT, INSERT, UPDATE ON org_sponsor_payment_requests TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_sponsor_payment_requests_id_seq TO causal_app;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_sponsored_project_disbursements_request_fk') THEN
    ALTER TABLE org_sponsored_project_disbursements ADD CONSTRAINT org_sponsored_project_disbursements_request_fk
      FOREIGN KEY (payment_request_id) REFERENCES org_sponsor_payment_requests(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Recalls (money taken back from a project fund; posted in Accounting)
CREATE TABLE IF NOT EXISTS org_sponsor_recalls (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  amount_cents            bigint NOT NULL CHECK (amount_cents > 0),
  recall_date             date NOT NULL,
  reason                  text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'void')),
  ledger_transaction_id   integer REFERENCES org_ledger_transactions(id) ON DELETE SET NULL,
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  void_reason             text
);
CREATE INDEX IF NOT EXISTS org_sponsor_recalls_project_idx ON org_sponsor_recalls (sponsored_project_id);

ALTER TABLE org_sponsor_recalls ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_recalls FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_recalls_org_isolation ON org_sponsor_recalls;
CREATE POLICY org_sponsor_recalls_org_isolation ON org_sponsor_recalls
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
DROP POLICY IF EXISTS org_sponsor_recalls_program_scope ON org_sponsor_recalls;
CREATE POLICY org_sponsor_recalls_program_scope ON org_sponsor_recalls AS RESTRICTIVE
  USING (current_program_ids() IS NULL OR EXISTS (
    SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())));
GRANT SELECT, INSERT, UPDATE ON org_sponsor_recalls TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_sponsor_recalls_id_seq TO causal_app;

ALTER TABLE org_sponsor_settings ADD COLUMN IF NOT EXISTS recall_expense_account_id integer REFERENCES org_accounts(id) ON DELETE SET NULL;
ALTER TABLE org_sponsor_settings ADD COLUMN IF NOT EXISTS recall_income_account_id integer REFERENCES org_accounts(id) ON DELETE SET NULL;

DO $$ BEGIN PERFORM org_allow_ledger_source('sponsor_recall'); END $$;

-- Overdue-report hold: puts a project on hold when its report is late by more than the workspace setting,
-- and lifts an automatic hold once the report is in or the due date moves. Safe to run any number of times.
CREATE OR REPLACE FUNCTION org_apply_sponsor_report_holds()
  RETURNS TABLE (org_id integer, sponsored_project_id integer, action text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH placed AS (
    UPDATE org_sponsored_projects p
       SET status_before_hold = p.status, status = 'on_hold', hold_kind = 'report_overdue', hold_reason = 'report overdue',
           hold_set_by = NULL, hold_set_at = now(), updated_at = now()
      FROM org_settings s
      LEFT JOIN org_sponsor_settings ss ON ss.org_id = s.org_id
     WHERE s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
       AND p.status IN ('active', 'winding_down')
       AND p.next_report_due IS NOT NULL
       AND p.next_report_due + COALESCE(ss.overdue_report_hold_days, 30) < CURRENT_DATE
       AND (p.last_report_received_at IS NULL OR p.last_report_received_at < p.next_report_due)
       AND p.report_hold_waived_for IS DISTINCT FROM p.next_report_due
    RETURNING p.sponsor_org_id, p.id
  ), lifted AS (
    UPDATE org_sponsored_projects p
       SET status = COALESCE(p.status_before_hold, 'active'), status_before_hold = NULL, hold_kind = NULL, hold_reason = NULL,
           hold_set_by = NULL, hold_set_at = NULL, updated_at = now()
     WHERE p.status = 'on_hold' AND p.hold_kind = 'report_overdue'
       AND (p.next_report_due IS NULL OR p.next_report_due >= CURRENT_DATE
            OR (p.last_report_received_at IS NOT NULL AND p.last_report_received_at >= p.next_report_due))
    RETURNING p.sponsor_org_id, p.id
  ), logged AS (
    INSERT INTO org_audit_log (org_id, user_id, action, table_name, record_id, field_name, old_value, new_value, metadata)
    SELECT x.sponsor_org_id, NULL::integer, 'update', 'org_sponsored_projects', x.id, 'status', 'active', 'on_hold', '{"reason":"report overdue","by":"daily job"}'::jsonb FROM placed x
    UNION ALL
    SELECT x.sponsor_org_id, NULL::integer, 'update', 'org_sponsored_projects', x.id, 'status', 'on_hold', 'active', '{"reason":"report received or due date moved","by":"daily job"}'::jsonb FROM lifted x
    RETURNING 1
  )
  SELECT x.sponsor_org_id, x.id, 'placed'::text FROM placed x
  UNION ALL
  SELECT x.sponsor_org_id, x.id, 'lifted'::text FROM lifted x;
END $$;
REVOKE ALL ON FUNCTION org_apply_sponsor_report_holds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_apply_sponsor_report_holds() TO causal_app;
