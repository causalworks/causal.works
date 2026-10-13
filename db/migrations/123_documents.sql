-- 123: Documents module — per-org document tracking & retention.
--
-- Deliberately named org_documents/org_document_expectations rather than
-- coop_*/cooperative_* — those two prefixes already carry conflicting
-- meanings elsewhere (coop_* = one org's private data, cooperative_* =
-- content shared/visible across orgs). These tables are always
-- single-org-scoped; the coop_org_id column name is kept only because it's
-- the standard FK name pointing at coop_orgs(id) used throughout the schema.

CREATE TYPE org_document_category AS ENUM (
  'irs_determination_letter',
  'form_990',
  'audited_financials',
  'management_letter',
  'board_minutes',
  'board_resolution',
  'bylaws',
  'articles_of_incorporation',
  'conflict_of_interest_policy',
  'coi_disclosure',
  'financial_policy',
  'personnel_policy',
  'grant_agreement',
  'award_letter',
  'funder_report',
  'insurance_certificate',
  'state_registration',
  'vendor_w9',
  'contract_lease',
  'payroll_tax_filing',
  'bank_statement',
  'other'
);

CREATE TYPE org_document_retention_class AS ENUM (
  'permanent',
  'fixed_term',
  'superseded_on_replacement'
);

CREATE TYPE org_document_visibility AS ENUM (
  'org_all',
  'admins_only'
);

CREATE TABLE IF NOT EXISTS org_documents (
  id SERIAL PRIMARY KEY,
  coop_org_id INTEGER NOT NULL REFERENCES coop_orgs(id) ON DELETE CASCADE,
  category org_document_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  original_filename TEXT NOT NULL,
  stored_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  fiscal_year INTEGER,
  document_date DATE,
  effective_date DATE,
  expiration_date DATE,
  retention_class org_document_retention_class NOT NULL DEFAULT 'fixed_term',
  retention_years INTEGER,
  retention_until DATE,
  version INTEGER NOT NULL DEFAULT 1,
  supersedes_id INTEGER REFERENCES org_documents(id) ON DELETE SET NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  visibility org_document_visibility NOT NULL DEFAULT 'org_all',
  grant_id INTEGER REFERENCES coop_grants(id) ON DELETE SET NULL,
  obligation_id INTEGER REFERENCES coop_org_compliance_obligations(id) ON DELETE SET NULL,
  uploaded_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT org_documents_fy_reasonable CHECK (fiscal_year IS NULL OR (fiscal_year >= 1900 AND fiscal_year <= 2200))
);

CREATE INDEX IF NOT EXISTS idx_org_documents_org_category_current ON org_documents (coop_org_id, category, is_current);
CREATE INDEX IF NOT EXISTS idx_org_documents_org_fy ON org_documents (coop_org_id, fiscal_year);
CREATE INDEX IF NOT EXISTS idx_org_documents_org_expiration ON org_documents (coop_org_id, expiration_date) WHERE expiration_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_org_documents_grant ON org_documents (grant_id);
CREATE INDEX IF NOT EXISTS idx_org_documents_obligation ON org_documents (obligation_id);
CREATE INDEX IF NOT EXISTS idx_org_documents_supersedes ON org_documents (supersedes_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_documents_org_checksum ON org_documents (coop_org_id, checksum_sha256) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS org_document_expectations (
  id SERIAL PRIMARY KEY,
  coop_org_id INTEGER REFERENCES coop_orgs(id) ON DELETE CASCADE,
  category org_document_category NOT NULL,
  label TEXT NOT NULL,
  cadence TEXT NOT NULL CHECK (cadence IN ('annual', 'one_time', 'as_occurs')),
  default_retention_class org_document_retention_class NOT NULL DEFAULT 'fixed_term',
  default_retention_years INTEGER,
  guidance_markdown TEXT,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_org_document_expectations_org ON org_document_expectations (coop_org_id);

-- Standard nonprofit records-retention norms. coop_org_id left NULL so these
-- apply to every org; per-org overrides can be added later as additional rows.
INSERT INTO org_document_expectations (category, label, cadence, default_retention_class, default_retention_years, guidance_markdown, display_order) VALUES
  ('articles_of_incorporation', 'Articles of Incorporation', 'one_time', 'permanent', NULL, 'Keep permanently; foundational governing document.', 10),
  ('bylaws', 'Bylaws (current + amendments)', 'as_occurs', 'permanent', NULL, 'Keep permanently, including superseded versions for historical record.', 20),
  ('irs_determination_letter', 'IRS Determination Letter', 'one_time', 'permanent', NULL, 'Keep permanently; proof of tax-exempt status.', 30),
  ('form_990', 'Form 990', 'annual', 'permanent', NULL, 'Keep permanently. Also required to be publicly disclosable on request.', 40),
  ('audited_financials', 'Audited Financial Statements', 'annual', 'permanent', NULL, 'Keep permanently, including the auditor management letter.', 50),
  ('management_letter', 'Auditor Management Letter', 'annual', 'permanent', NULL, 'Keep permanently alongside the corresponding audit.', 60),
  ('board_minutes', 'Board Meeting Minutes', 'as_occurs', 'permanent', NULL, 'Keep permanently; primary governance record.', 70),
  ('board_resolution', 'Board Resolutions', 'as_occurs', 'permanent', NULL, 'Keep permanently.', 80),
  ('conflict_of_interest_policy', 'Conflict of Interest Policy', 'one_time', 'permanent', NULL, 'Keep permanently; update in place when revised.', 90),
  ('coi_disclosure', 'Annual COI Disclosures', 'annual', 'fixed_term', 7, 'Retain at least 7 years per standard nonprofit practice.', 100),
  ('bank_statement', 'Bank Statements', 'annual', 'fixed_term', 7, 'Retain at least 7 years for financial recordkeeping.', 110),
  ('payroll_tax_filing', 'Payroll Tax Filings', 'annual', 'fixed_term', 7, 'Retain at least 7 years per IRS employment tax recordkeeping guidance.', 120),
  ('vendor_w9', 'Vendor W-9 Forms', 'as_occurs', 'fixed_term', 7, 'Retain at least 7 years for 1099 reporting support.', 130),
  ('contract_lease', 'Contracts & Leases', 'as_occurs', 'fixed_term', 4, 'Retain at least 4 years after expiration/termination.', 140),
  ('personnel_policy', 'Personnel Policies', 'as_occurs', 'fixed_term', 4, 'Retain current version plus 4 years of superseded versions.', 150),
  ('insurance_certificate', 'Insurance Certificates (D&O, General Liability)', 'annual', 'fixed_term', NULL, 'Track by the certificate''s own expiration date, not a fixed duration.', 160),
  ('state_registration', 'State Charitable Solicitation Registration', 'annual', 'fixed_term', NULL, 'Track by the registration''s own expiration/renewal date.', 170);
