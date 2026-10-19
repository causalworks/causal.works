-- Sponsorship: applications, agreement templates and agreements, project document types, the reports calendar
-- with its reminder log, standing-term acknowledgments, the approvals queue, and report-driven holds.

CREATE OR REPLACE FUNCTION org_sponsor_enable_rls(p_table text, p_with_project boolean) RETURNS void
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_table || '_org_isolation', p_table);
  EXECUTE format($p$CREATE POLICY %I ON %I
    USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
    WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)$p$, p_table || '_org_isolation', p_table);
  IF p_with_project THEN
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p_table || '_program_scope', p_table);
    EXECUTE format($p$CREATE POLICY %I ON %I AS RESTRICTIVE
      USING (current_program_ids() IS NULL OR EXISTS (
        SELECT 1 FROM org_sponsored_projects p WHERE p.id = sponsored_project_id AND p.program_id = ANY (current_program_ids())))$p$,
      p_table || '_program_scope', p_table);
  END IF;
  EXECUTE format('GRANT SELECT, INSERT, UPDATE ON %I TO causal_app', p_table);
  EXECUTE format('GRANT USAGE, SELECT ON SEQUENCE %I TO causal_app', p_table || '_id_seq');
END $$;
REVOKE ALL ON FUNCTION org_sponsor_enable_rls(text, boolean) FROM PUBLIC;

-- Project lead as a contact
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS lead_constituent_id integer REFERENCES org_constituents(id) ON DELETE SET NULL;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS receiving_constituent_id integer REFERENCES org_constituents(id) ON DELETE SET NULL;

-- Applications
CREATE TABLE IF NOT EXISTS org_sponsor_applications (
  id                        serial PRIMARY KEY,
  org_id                    integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  applicant_constituent_id  integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  lead_constituent_id       integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  project_name              text NOT NULL,
  mission                   text,
  activities                text,
  budget_cents              bigint CHECK (budget_cents IS NULL OR budget_cents >= 0),
  leaders                   text,
  expected_funders          text,
  risks                     text,
  status                    text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'in_review', 'accepted', 'declined')),
  source                    text NOT NULL DEFAULT 'staff' CHECK (source IN ('staff', 'public')),
  created_by                integer,
  created_at                timestamptz NOT NULL DEFAULT now(),
  decided_by                integer,
  decided_at                timestamptz,
  decision_reason           text,
  sponsored_project_id      integer REFERENCES org_sponsored_projects(id) ON DELETE SET NULL
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_applications', false); END $$;

-- Agreement templates (org_id NULL rows are the shared defaults)
CREATE TABLE IF NOT EXISTS org_sponsor_agreement_templates (
  id          serial PRIMARY KEY,
  org_id      integer REFERENCES coop_members(id) ON DELETE CASCADE,
  model       text CHECK (model IS NULL OR model IN ('model_a', 'model_c', 'other')),
  title       text NOT NULL,
  body        text NOT NULL,
  archived_at timestamptz,
  created_by  integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_sponsor_agreement_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_sponsor_agreement_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_sponsor_agreement_templates_org_isolation ON org_sponsor_agreement_templates;
CREATE POLICY org_sponsor_agreement_templates_org_isolation ON org_sponsor_agreement_templates
  USING ((org_id IS NULL) OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer))
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE ON org_sponsor_agreement_templates TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_sponsor_agreement_templates_id_seq TO causal_app;

-- Agreements and amendments
CREATE TABLE IF NOT EXISTS org_sponsor_agreements (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  template_id             integer REFERENCES org_sponsor_agreement_templates(id) ON DELETE SET NULL,
  effective_date          date NOT NULL,
  term_values             jsonb NOT NULL DEFAULT '{}'::jsonb,
  generated_document_id   integer REFERENCES org_documents(id) ON DELETE SET NULL,
  signed_document_id      integer REFERENCES org_documents(id) ON DELETE SET NULL,
  signed_at               date,
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_agreements', true); END $$;

CREATE TABLE IF NOT EXISTS org_sponsor_agreement_amendments (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  agreement_id            integer NOT NULL REFERENCES org_sponsor_agreements(id) ON DELETE CASCADE,
  effective_date          date NOT NULL,
  summary                 text NOT NULL,
  document_id             integer NOT NULL REFERENCES org_documents(id),
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_agreement_amendments', true); END $$;

-- Document types on project documents; a new version keeps its type
ALTER TABLE org_documents ADD COLUMN IF NOT EXISTS sponsor_doc_type text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_documents_sponsor_doc_type_check') THEN
    ALTER TABLE org_documents ADD CONSTRAINT org_documents_sponsor_doc_type_check CHECK (sponsor_doc_type IS NULL OR sponsor_doc_type IN
      ('application', 'agreement', 'insurance', 'report', 'correspondence', 'tax_form', 'donor_letter'));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION org_documents_keep_sponsor_doc_type() RETURNS trigger
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.sponsor_doc_type IS NULL AND NEW.supersedes_id IS NOT NULL THEN
    SELECT d.sponsor_doc_type INTO NEW.sponsor_doc_type FROM org_documents d WHERE d.id = NEW.supersedes_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_org_documents_keep_sponsor_doc_type ON org_documents;
CREATE TRIGGER trg_org_documents_keep_sponsor_doc_type BEFORE INSERT ON org_documents
  FOR EACH ROW EXECUTE FUNCTION org_documents_keep_sponsor_doc_type();

-- Reports calendar (project-to-sponsor quarterly reports and sponsor-to-funder reports)
CREATE TABLE IF NOT EXISTS org_sponsor_reports (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  kind                    text NOT NULL CHECK (kind IN ('project_quarterly', 'funder')),
  funder_constituent_id   integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  title                   text,
  period_start            date,
  period_end              date,
  due_date                date NOT NULL,
  received_at             date,
  received_by             integer,
  document_id             integer REFERENCES org_documents(id) ON DELETE SET NULL,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS org_sponsor_reports_quarter_uq ON org_sponsor_reports (sponsored_project_id, period_end) WHERE kind = 'project_quarterly';
CREATE INDEX IF NOT EXISTS org_sponsor_reports_due_idx ON org_sponsor_reports (org_id, due_date) WHERE received_at IS NULL;
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_reports', true); END $$;

CREATE TABLE IF NOT EXISTS org_sponsor_report_reminders (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  report_id               integer NOT NULL REFERENCES org_sponsor_reports(id) ON DELETE CASCADE,
  reminder_kind           text NOT NULL CHECK (reminder_kind IN ('due_soon', 'overdue')),
  send_status             text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped')),
  created_at              timestamptz NOT NULL DEFAULT now(),
  sent_at                 timestamptz,
  UNIQUE (report_id, reminder_kind)
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_report_reminders', true); END $$;

-- Standing terms acknowledged by each project (dated)
CREATE TABLE IF NOT EXISTS org_sponsor_acknowledgments (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  item_key                text NOT NULL,
  acknowledged_on         date NOT NULL,
  document_id             integer REFERENCES org_documents(id) ON DELETE SET NULL,
  note                    text,
  recorded_by             integer,
  created_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS org_sponsor_acknowledgments_project_idx ON org_sponsor_acknowledgments (sponsored_project_id, item_key, acknowledged_on);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_acknowledgments', true); END $$;

-- Approvals queue for items that use the sponsor's name
CREATE TABLE IF NOT EXISTS org_sponsor_approvals (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  kind                    text NOT NULL CHECK (kind IN ('letter_of_inquiry', 'proposal', 'pledge', 'agreement', 'solicitation', 'publicity')),
  title                   text NOT NULL,
  funder_constituent_id   integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  draft_document_id       integer REFERENCES org_documents(id) ON DELETE SET NULL,
  status                  text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined')),
  requested_by            integer,
  requested_at            timestamptz NOT NULL DEFAULT now(),
  decided_by              integer,
  decided_at              timestamptz,
  decision_reason         text,
  signed_document_id      integer REFERENCES org_documents(id) ON DELETE SET NULL
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_approvals', true); END $$;

-- Quarterly report rows for every running project, due a set number of days after each fiscal quarter ends. Safe to rerun.
CREATE OR REPLACE FUNCTION org_generate_sponsor_quarterly_reports(p_due_days integer DEFAULT 30)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  n integer;
BEGIN
  WITH proj AS (
    SELECT p.id, p.sponsor_org_id, COALESCE(p.start_date, p.created_at::date) AS start_on,
           ((COALESCE(s.fiscal_year_end_month, 12) % 12) + 1) AS fy_start
      FROM org_sponsored_projects p JOIN org_settings s ON s.org_id = p.sponsor_org_id
     WHERE s.fiscal_sponsorship_mode AND p.status IN ('active', 'on_hold', 'winding_down')
  ), bounds AS (
    SELECT id, sponsor_org_id,
           (date_trunc('month', start_on) - make_interval(months => ((extract(month FROM start_on)::int - fy_start + 12) % 12) % 3))::date AS first_q,
           (date_trunc('month', CURRENT_DATE) - make_interval(months => ((extract(month FROM CURRENT_DATE)::int - fy_start + 12) % 12) % 3))::date AS last_q
      FROM proj
  ), quarters AS (
    SELECT b.id, b.sponsor_org_id, q::date AS q_start, (q + interval '3 months' - interval '1 day')::date AS q_end
      FROM bounds b, generate_series(b.first_q, b.last_q, interval '3 months') AS q
  ), ins AS (
    INSERT INTO org_sponsor_reports (org_id, sponsored_project_id, kind, title, period_start, period_end, due_date)
    SELECT q.sponsor_org_id, q.id, 'project_quarterly', 'Quarterly report', q.q_start, q.q_end, q.q_end + p_due_days
      FROM quarters q
    ON CONFLICT (sponsored_project_id, period_end) WHERE kind = 'project_quarterly' DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO n FROM ins;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION org_generate_sponsor_quarterly_reports(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_generate_sponsor_quarterly_reports(integer) TO causal_app;

-- Overdue-report hold, now read from the reports calendar (the older single due date still counts for projects without report rows)
CREATE OR REPLACE FUNCTION org_sponsor_overdue_report_due(p_project_id integer, p_hold_days integer)
  RETURNS date LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT min(r.due_date) FROM org_sponsor_reports r
      WHERE r.sponsored_project_id = p_project_id AND r.kind = 'project_quarterly' AND r.received_at IS NULL
        AND r.due_date + p_hold_days < CURRENT_DATE),
    (SELECT p.next_report_due FROM org_sponsored_projects p
      WHERE p.id = p_project_id AND p.next_report_due IS NOT NULL AND p.next_report_due + p_hold_days < CURRENT_DATE
        AND (p.last_report_received_at IS NULL OR p.last_report_received_at < p.next_report_due)
        AND NOT EXISTS (SELECT 1 FROM org_sponsor_reports r WHERE r.sponsored_project_id = p.id AND r.kind = 'project_quarterly')));
$$;

CREATE OR REPLACE FUNCTION org_apply_sponsor_report_holds()
  RETURNS TABLE (org_id integer, sponsored_project_id integer, action text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH cand AS (
    SELECT p.id, p.sponsor_org_id, p.status, p.hold_kind, p.report_hold_waived_for,
           org_sponsor_overdue_report_due(p.id, COALESCE(ss.overdue_report_hold_days, 30)) AS overdue_due
      FROM org_sponsored_projects p
      JOIN org_settings s ON s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
      LEFT JOIN org_sponsor_settings ss ON ss.org_id = p.sponsor_org_id
     WHERE p.status IN ('active', 'winding_down') OR (p.status = 'on_hold' AND p.hold_kind = 'report_overdue')
  ), placed AS (
    UPDATE org_sponsored_projects p
       SET status_before_hold = p.status, status = 'on_hold', hold_kind = 'report_overdue', hold_reason = 'report overdue',
           hold_set_by = NULL, hold_set_at = now(), updated_at = now()
      FROM cand c
     WHERE c.id = p.id AND c.status IN ('active', 'winding_down') AND c.overdue_due IS NOT NULL
       AND c.report_hold_waived_for IS DISTINCT FROM c.overdue_due
    RETURNING p.sponsor_org_id, p.id
  ), lifted AS (
    UPDATE org_sponsored_projects p
       SET status = COALESCE(p.status_before_hold, 'active'), status_before_hold = NULL, hold_kind = NULL, hold_reason = NULL,
           hold_set_by = NULL, hold_set_at = NULL, updated_at = now()
      FROM cand c
     WHERE c.id = p.id AND c.status = 'on_hold' AND c.overdue_due IS NULL
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

-- Report reminders: writes the log row first (one per report and kind), then returns what to send.
CREATE OR REPLACE FUNCTION org_claim_sponsor_report_reminders()
  RETURNS TABLE (reminder_id integer, org_id integer, sponsored_project_id integer, reminder_kind text, project_name text,
                 due_date date, period_start date, period_end date, lead_email text, lead_name text, org_name text, reply_to text)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT r.id AS report_id, r.org_id, r.sponsored_project_id,
           CASE WHEN r.due_date < CURRENT_DATE THEN 'overdue' ELSE 'due_soon' END AS kind
      FROM org_sponsor_reports r
      JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
      JOIN org_settings s ON s.org_id = r.org_id AND s.fiscal_sponsorship_mode
     WHERE r.kind = 'project_quarterly' AND r.received_at IS NULL
       AND r.due_date <= CURRENT_DATE + 7 AND r.due_date >= CURRENT_DATE - 60
       AND p.status IN ('active', 'on_hold', 'winding_down')
  ), claimed AS (
    INSERT INTO org_sponsor_report_reminders (org_id, sponsored_project_id, report_id, reminder_kind)
    SELECT d.org_id, d.sponsored_project_id, d.report_id, d.kind FROM due d
    ON CONFLICT (report_id, reminder_kind) DO NOTHING
    RETURNING id, org_id, sponsored_project_id, report_id, reminder_kind
  )
  SELECT c.id, c.org_id, c.sponsored_project_id, c.reminder_kind, p.name, r.due_date, r.period_start, r.period_end,
         COALESCE(NULLIF(lc.email, ''), p.contact_lead_email), COALESCE(lc.display_name, p.contact_lead_name), m.display_name,
         COALESCE(NULLIF(s.reply_to_email, ''), s.contact_email)
    FROM claimed c
    JOIN org_sponsor_reports r ON r.id = c.report_id
    JOIN org_sponsored_projects p ON p.id = c.sponsored_project_id
    JOIN coop_members m ON m.id = c.org_id
    JOIN org_settings s ON s.org_id = c.org_id
    LEFT JOIN org_constituents lc ON lc.id = p.lead_constituent_id;
END $$;
REVOKE ALL ON FUNCTION org_claim_sponsor_report_reminders() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_claim_sponsor_report_reminders() TO causal_app;

CREATE OR REPLACE FUNCTION org_mark_sponsor_report_reminder(p_id integer, p_status text)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE org_sponsor_report_reminders SET send_status = p_status, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
   WHERE id = p_id AND p_status IN ('sent', 'failed', 'skipped');
$$;
REVOKE ALL ON FUNCTION org_mark_sponsor_report_reminder(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_mark_sponsor_report_reminder(integer, text) TO causal_app;

-- Shared default agreement templates
INSERT INTO org_sponsor_agreement_templates (org_id, model, title, body)
SELECT NULL, v.model, v.title, v.body FROM (VALUES
('model_a', 'Fiscal sponsorship agreement (comprehensive)', $t$FISCAL SPONSORSHIP AGREEMENT

This agreement is between {{sponsor_name}} (the Sponsor) and the project known as {{project_name}} (the Project). It takes effect on {{effective_date}}.

1. Purpose and oversight. The Project's purpose is: {{project_purpose}}. The Sponsor has full oversight of the Project and its activities so that they stay within the Sponsor's charitable purposes.

2. The Project is part of the Sponsor. The Project's staff and volunteers work under the Sponsor's policies. People who work on the Project are engaged by the Sponsor, and the Sponsor pays the Project's bills directly.

3. Gifts belong to the Sponsor. Every gift, grant and other payment received for the Project is an asset of the Sponsor, held in a restricted fund for the Project's purpose. Donors give to the Sponsor for the Project's purpose; a donor cannot direct a gift to any individual.

4. Control of spending. The Sponsor decides the date and amount of every payment from the Project fund. Nothing is paid before money is received, and the Sponsor does not advance its own funds.

5. Variance power. The Sponsor may withhold, recall or redirect any part of the Project fund to another charitable purpose if the Project's purpose becomes impossible, impractical or inconsistent with the Sponsor's charitable purposes or the law.

6. Administrative charge. The Project fund pays the Sponsor an administrative charge of {{fee_text}}. The charge is taken when money is received.

7. Records and audit. The Sponsor keeps the Project's records. The Project gives the Sponsor any information it asks for, and the Sponsor may audit any Project activity.

8. Reports. The Project sends the Sponsor a written report within {{report_days}} days after the end of each quarter, covering activities, money spent and progress against the budget.

9. Lobbying and political activity. The Project does no political campaign activity of any kind. Any lobbying stays within the limits the Sponsor sets and within the lobbying budget in the exhibit.

10. Approvals and the Sponsor's name. The Sponsor approves in advance every grant proposal, funder agreement, solicitation, pledge and piece of publicity that uses the Sponsor's name. Fundraising materials say that the Sponsor holds the funds and has variance power over them.

11. Indemnity. The Project's leaders will hold the Sponsor harmless from claims arising from acts outside the scope of this agreement.

12. Term and ending. This agreement ends when the Project becomes its own charity and the Sponsor approves the transfer, on {{notice_days}} days' written notice by either side, or on {{term_end}}, whichever comes first.

13. Remaining funds. When this agreement ends, the remaining Project fund, after the Sponsor's own liabilities for the Project, goes to the Project's successor charity, to another fiscal sponsor under a written agreement, or as the Sponsor decides under this agreement.

14. Amendments. Any change to this agreement is made in writing and signed by both sides.

Exhibit A. The board-approved Project proposal and budget, including any lobbying budget.

Signed for the Sponsor: ____________________   Date: ________

Signed for the Project: ____________________   Date: ________
$t$),
('model_c', 'Fiscal sponsorship agreement (pre-approved grant)', $t$FISCAL SPONSORSHIP AGREEMENT: PRE-APPROVED GRANT

This agreement is between {{sponsor_name}} (the Sponsor) and {{receiving_entity}} (the Grantee), which carries out the project known as {{project_name}} (the Project). It takes effect on {{effective_date}}.

1. Purpose and oversight. The Project's purpose is: {{project_purpose}}. The Sponsor makes grants to the Grantee for this purpose and oversees the use of every grant.

2. Gifts belong to the Sponsor. Every gift, grant and other payment received for the Project is an asset of the Sponsor, held in a restricted fund for the Project's purpose. Donors give to the Sponsor for the Project's purpose; a donor cannot direct a gift to any individual.

3. Grants to the Grantee. The Sponsor decides the date and amount of every grant from the Project fund. Each grant is made under a signed grant letter. Nothing is granted before money is received, and the Sponsor does not advance its own funds. The Grantee gives the Sponsor a completed taxpayer identification form before the first grant.

4. The Grantee's own staff. The Grantee employs and pays its own staff and volunteers and is responsible for its own taxes, insurance and contracts.

5. Variance power. The Sponsor may withhold, recall or redirect any part of the Project fund to another charitable purpose if the Project's purpose becomes impossible, impractical or inconsistent with the Sponsor's charitable purposes or the law.

6. Administrative charge. The Project fund pays the Sponsor an administrative charge of {{fee_text}}. The charge is taken when money is received.

7. Records and audit. The Grantee keeps records of how each grant is spent, gives the Sponsor any information it asks for, and lets the Sponsor audit the use of every grant.

8. Reports. The Grantee sends the Sponsor a written report within {{report_days}} days after the end of each quarter, covering activities, money spent and progress against the budget.

9. Lobbying and political activity. No grant may be used for political campaign activity of any kind. Any lobbying paid for by a grant stays within the limits the Sponsor sets and within the lobbying budget in the exhibit.

10. Approvals and the Sponsor's name. The Sponsor approves in advance every grant proposal, funder agreement, solicitation, pledge and piece of publicity that uses the Sponsor's name. Fundraising materials say that the Sponsor holds the funds and has variance power over them.

11. Indemnity. The Grantee will hold the Sponsor harmless from claims arising from the Grantee's activities.

12. Term and ending. This agreement ends when the Project becomes its own charity and the Sponsor approves the transfer, on {{notice_days}} days' written notice by either side, or on {{term_end}}, whichever comes first.

13. Remaining funds. When this agreement ends, the remaining Project fund, after the Sponsor's own liabilities for the Project, goes to the Project's successor charity, to another fiscal sponsor under a written agreement, or as the Sponsor decides under this agreement.

14. Amendments. Any change to this agreement is made in writing and signed by both sides.

Exhibit A. The board-approved Project proposal and budget, including any lobbying budget.

Signed for the Sponsor: ____________________   Date: ________

Signed for the Grantee: ____________________   Date: ________
$t$)
) AS v(model, title, body)
WHERE NOT EXISTS (SELECT 1 FROM org_sponsor_agreement_templates t WHERE t.org_id IS NULL AND t.model = v.model);
