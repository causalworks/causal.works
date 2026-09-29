-- 062: Create compliance schema with base-template-plus-org-extension model

-- Enum types
CREATE TYPE compliance_source AS ENUM ('base_template', 'org_extension');
CREATE TYPE compliance_frequency AS ENUM ('annual', 'quarterly', 'monthly', 'one_time', 'deadline_driven');
CREATE TYPE compliance_obligation_status AS ENUM ('upcoming', 'due_soon', 'overdue', 'completed_this_cycle', 'not_applicable');
CREATE TYPE proposal_status AS ENUM ('draft', 'submitted', 'under_review', 'promoted', 'declined', 'withdrawn');

-- Extend np_orgs with compliance characteristics
ALTER TABLE np_orgs
  ADD COLUMN IF NOT EXISTS entity_classification TEXT,
  ADD COLUMN IF NOT EXISTS federal_grant_recipient BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS state_charitable_solicitation_registrations TEXT[],
  ADD COLUMN IF NOT EXISTS has_lobbying_activity BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS has_political_electoral_activity BOOLEAN NOT NULL DEFAULT FALSE;

-- Base template items maintained by the cooperative
CREATE TABLE IF NOT EXISTS compliance_template_items (
  id SERIAL PRIMARY KEY,
  applies_to_org_type TEXT[] NOT NULL, -- e.g., ARRAY['501c3', 'fiscal_sponsor']
  category TEXT NOT NULL, -- e.g., tax_filing, state_registration, governance, fiscal_sponsor_specific, federal_grants_specific
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  frequency compliance_frequency NOT NULL,
  default_due_pattern TEXT, -- e.g., "annually by [fiscal year end + 4.5 months]"
  guidance_markdown TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_template_items_category ON compliance_template_items (category, display_order);
CREATE INDEX IF NOT EXISTS idx_compliance_template_items_applies_to ON compliance_template_items USING GIN (applies_to_org_type);

-- Each org's actual obligations
CREATE TABLE IF NOT EXISTS np_org_compliance_obligations (
  id SERIAL PRIMARY KEY,
  np_org_id INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  source compliance_source NOT NULL DEFAULT 'base_template',
  template_item_id INTEGER REFERENCES compliance_template_items(id) ON DELETE SET NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  frequency compliance_frequency NOT NULL,
  next_due_date DATE,
  last_completed_date DATE,
  status compliance_obligation_status NOT NULL DEFAULT 'upcoming',
  notes_markdown TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_np_org_compliance_obligations_org ON np_org_compliance_obligations (np_org_id);
CREATE INDEX IF NOT EXISTS idx_np_org_compliance_obligations_status ON np_org_compliance_obligations (status, next_due_date);
CREATE INDEX IF NOT EXISTS idx_np_org_compliance_obligations_category ON np_org_compliance_obligations (category);
CREATE INDEX IF NOT EXISTS idx_np_org_compliance_obligations_template ON np_org_compliance_obligations (template_item_id);

-- Extension proposals for cooperative review
CREATE TABLE IF NOT EXISTS compliance_extension_proposals (
  id SERIAL PRIMARY KEY,
  np_org_id INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  proposed_obligation_id INTEGER NOT NULL REFERENCES np_org_compliance_obligations(id) ON DELETE CASCADE,
  proposal_status proposal_status NOT NULL DEFAULT 'draft',
  cooperative_notes_markdown TEXT,
  decided_at TIMESTAMPTZ,
  decided_by_user_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_extension_proposals_org ON compliance_extension_proposals (np_org_id);
CREATE INDEX IF NOT EXISTS idx_compliance_extension_proposals_status ON compliance_extension_proposals (proposal_status);
