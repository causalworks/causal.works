-- org_document_expectations holds one organization's document checklist but had no row-level security, unlike every
-- other table with an org_id. Same isolation policy as the rest.
ALTER TABLE org_document_expectations ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_document_expectations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_document_expectations_org_isolation ON org_document_expectations;
-- Rows with no org_id are the platform's default checklist and stay readable by everyone; an organization's own rows
-- are visible and writable only inside that organization.
CREATE POLICY org_document_expectations_org_isolation ON org_document_expectations
  USING (org_id IS NULL OR org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer)
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);
GRANT SELECT, INSERT, UPDATE, DELETE ON org_document_expectations TO causal_app;
