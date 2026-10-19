-- Sponsorship: monthly project statements (one per project and month), donor letters on gifts, and releasing donated property as a grant at value.

CREATE TABLE IF NOT EXISTS org_sponsor_statements (
  id                      serial PRIMARY KEY,
  org_id                  integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id    integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  month                   date NOT NULL CHECK (extract(day FROM month) = 1),
  opening_cents           bigint,
  income_cents            bigint,
  fees_cents              bigint,
  expenses_cents          bigint,
  closing_cents           bigint,
  generated_document_id   integer REFERENCES org_documents(id) ON DELETE SET NULL,
  send_status             text NOT NULL DEFAULT 'pending' CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped', 'not_sent')),
  sent_at                 timestamptz,
  sent_to                 text,
  created_by              integer,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sponsored_project_id, month)
);
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_statements', true); END $$;

-- Donor letter on a gift (required above the threshold for checks, transfers and wires to a project)
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS donor_letter_document_id integer REFERENCES org_documents(id) ON DELETE SET NULL;

-- Disbursements can release donated property (an in-kind gift) as a grant at its recorded value
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cash';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'org_sponsored_project_disbursements_kind_check') THEN
    ALTER TABLE org_sponsored_project_disbursements ADD CONSTRAINT org_sponsored_project_disbursements_kind_check CHECK (kind IN ('cash', 'property'));
  END IF;
END $$;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS property_gift_id integer REFERENCES org_gifts(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS org_sponsored_project_disbursements_property_uq ON org_sponsored_project_disbursements (property_gift_id)
  WHERE property_gift_id IS NOT NULL AND status <> 'void';

-- Statement rows due today: for each running project in a sponsor workspace, the previous month once the statement day has come.
-- The row is the send log; the function returns only rows it just created, so a rerun returns nothing.
CREATE OR REPLACE FUNCTION org_claim_sponsor_statements()
  RETURNS TABLE (statement_id integer, org_id integer, sponsored_project_id integer, month date)
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  INSERT INTO org_sponsor_statements (org_id, sponsored_project_id, month)
  SELECT p.sponsor_org_id, p.id, (date_trunc('month', CURRENT_DATE) - interval '1 month')::date
    FROM org_sponsored_projects p
    JOIN org_settings s ON s.org_id = p.sponsor_org_id AND s.fiscal_sponsorship_mode
    JOIN org_sponsor_settings ss ON ss.org_id = p.sponsor_org_id
   WHERE p.status IN ('active', 'on_hold', 'winding_down')
     AND extract(day FROM CURRENT_DATE) >= ss.statement_day_of_month
     AND COALESCE(p.start_date, p.created_at::date) < date_trunc('month', CURRENT_DATE)::date
     AND date_trunc('month', CURRENT_DATE) - interval '1 month' >= date_trunc('month', ss.created_at)
  ON CONFLICT (sponsored_project_id, month) DO NOTHING
  RETURNING id, org_id, sponsored_project_id, month;
END $$;
REVOKE ALL ON FUNCTION org_claim_sponsor_statements() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION org_claim_sponsor_statements() TO causal_app;
