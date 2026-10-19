CREATE TABLE IF NOT EXISTS org_document_retention_rules (
  id                serial PRIMARY KEY,
  org_id            integer REFERENCES coop_members(id) ON DELETE CASCADE,
  category          org_document_category NOT NULL,
  retention_class   org_document_retention_class NOT NULL DEFAULT 'fixed_term',
  retention_years   integer,
  trigger           text NOT NULL DEFAULT 'year_end' CHECK (trigger IN ('record_date', 'year_end')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (org_id, category)
);

ALTER TABLE org_document_retention_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_document_retention_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_document_retention_rules_org_isolation ON org_document_retention_rules;
CREATE POLICY org_document_retention_rules_org_isolation ON org_document_retention_rules
  USING ((org_id IS NULL) OR (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer))
  WITH CHECK (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_document_retention_rules TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_document_retention_rules_id_seq TO causal_app;

INSERT INTO org_document_retention_rules (org_id, category, retention_class, retention_years, trigger) VALUES
  (NULL, 'vendor_bill', 'fixed_term', 7, 'year_end'),
  (NULL, 'customer_invoice', 'fixed_term', 7, 'year_end'),
  (NULL, 'expense_receipt', 'fixed_term', 7, 'year_end'),
  (NULL, 'bank_statement', 'fixed_term', 7, 'year_end'),
  (NULL, 'procurement_quote', 'fixed_term', 7, 'year_end'),
  (NULL, 'procurement_solicitation', 'fixed_term', 7, 'year_end'),
  (NULL, 'sponsee_report', 'fixed_term', 7, 'year_end'),
  (NULL, 'saved_report', 'fixed_term', 7, 'year_end'),
  (NULL, 'grant_agreement', 'fixed_term', 7, 'year_end'),
  (NULL, 'award_letter', 'fixed_term', 7, 'year_end'),
  (NULL, 'funder_report', 'fixed_term', 7, 'year_end'),
  (NULL, 'financial_policy', 'fixed_term', 7, 'year_end'),
  (NULL, 'other', 'fixed_term', 7, 'year_end')
ON CONFLICT DO NOTHING;
