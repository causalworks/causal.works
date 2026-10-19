-- Sponsorship: the pre-approved grant model (receiving entity, taxpayer form on file, a grant agreement on every release)
-- and closing a project with a recorded transfer of the remaining balance.

ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS w9_on_file boolean NOT NULL DEFAULT false;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS w9_document_id integer REFERENCES org_documents(id) ON DELETE SET NULL;
ALTER TABLE org_sponsored_projects ADD COLUMN IF NOT EXISTS w9_received_at date;

ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS payee_constituent_id integer REFERENCES org_constituents(id) ON DELETE SET NULL;
ALTER TABLE org_sponsored_project_disbursements ADD COLUMN IF NOT EXISTS grant_agreement_document_id integer REFERENCES org_documents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS org_sponsor_closings (
  id                          serial PRIMARY KEY,
  org_id                      integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  sponsored_project_id        integer NOT NULL REFERENCES org_sponsored_projects(id) ON DELETE CASCADE,
  destination_kind            text NOT NULL CHECK (destination_kind IN ('project_charity', 'new_sponsor', 'sponsor_decides')),
  destination_constituent_id  integer REFERENCES org_constituents(id) ON DELETE SET NULL,
  amount_cents                bigint NOT NULL CHECK (amount_cents >= 0),
  closing_date                date NOT NULL,
  reason                      text NOT NULL,
  document_id                 integer REFERENCES org_documents(id) ON DELETE SET NULL,
  status                      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'posted', 'void')),
  ledger_transaction_id       integer REFERENCES org_ledger_transactions(id) ON DELETE SET NULL,
  created_by                  integer,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  void_reason                 text
);
CREATE UNIQUE INDEX IF NOT EXISTS org_sponsor_closings_one_live ON org_sponsor_closings (sponsored_project_id) WHERE status <> 'void';
DO $$ BEGIN PERFORM org_sponsor_enable_rls('org_sponsor_closings', true); END $$;

DO $$ BEGIN PERFORM org_allow_ledger_source('sponsor_closing'); END $$;
