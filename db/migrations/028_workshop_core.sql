CREATE TABLE IF NOT EXISTS workshop_projects (
  id SERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  phase TEXT NOT NULL DEFAULT 'research' CHECK (phase IN ('research', 'synthesis', 'implementation', 'graduation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_workspaces (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, slug)
);

CREATE TABLE IF NOT EXISTS workshop_documents (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workshop_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_threads (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workshop_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workshop_messages (
  id SERIAL PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES workshop_threads(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_workspaces_project ON workshop_workspaces(project_id);
CREATE INDEX IF NOT EXISTS idx_workshop_documents_workspace ON workshop_documents(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_threads_workspace ON workshop_threads(workspace_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_messages_thread ON workshop_messages(thread_id, created_at ASC);

INSERT INTO workshop_projects (slug, name, description, phase)
VALUES (
  'personal-balance-sheet',
  'Balance Sheet Project',
  'Building a person-centered balance sheet framework that makes care work, ecological impact, and data heritage visible with accounting rigor.',
  'research'
)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  phase = EXCLUDED.phase,
  updated_at = NOW();

WITH project AS (
  SELECT id FROM workshop_projects WHERE slug = 'personal-balance-sheet'
)
INSERT INTO workshop_workspaces (project_id, slug, name, description)
SELECT project.id, x.slug, x.name, x.description
FROM project
JOIN (
  VALUES
    ('legal-principles-hub', 'Legal Principles Hub', 'Rights of Nature precedents, corporate personhood case law, and symmetry arguments.'),
    ('balance-sheet-line-item-definitions', 'Balance Sheet Line Item Definitions', 'Define balance sheet line items, corporate equivalents, and valuation methods.'),
    ('corporate-rights-mapping', 'Corporate Rights Mapping', 'Map corporate rights and corresponding person-level rights by legal symmetry.'),
    ('alternative-accounting-models-library', 'Alternative Accounting Models Library', 'Catalog and compare existing alternative accounting frameworks.'),
    ('trial-balance-income-statement', 'Trial Balance & Income Statement', 'Ensure accounting identity and trial balance coherence for implementation.'),
    ('data-requirements-implementation', 'Data Requirements & Implementation', 'Specify data requirements, source systems, and implementation strategy.')
) AS x(slug, name, description) ON true
ON CONFLICT (project_id, slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  updated_at = NOW();
