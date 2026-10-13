-- 065: Extend Workshop for coalition function build-out (W1.3)

-- Enum types
CREATE TYPE workshop_space_type AS ENUM ('coalition', 'cooperative_governance', 'cooperative_methods', 'org_internal');
CREATE TYPE workshop_access_scope AS ENUM ('members_only', 'cooperative_visible', 'public');
CREATE TYPE workshop_space_role AS ENUM ('convener', 'participant', 'observer');
-- proposal_status already exists from compliance extension proposals (migration 062), reuse it

-- Extend workshop_workspaces (the spec calls these workshop_spaces)
ALTER TABLE workshop_workspaces
  ADD COLUMN IF NOT EXISTS space_type workshop_space_type NOT NULL DEFAULT 'org_internal',
  ADD COLUMN IF NOT EXISTS e4a_turnarounds TEXT[],
  ADD COLUMN IF NOT EXISTS access_scope workshop_access_scope NOT NULL DEFAULT 'members_only';

-- Create workshop_space_members
CREATE TABLE IF NOT EXISTS workshop_space_members (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES workshop_workspaces(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  np_org_id INTEGER REFERENCES np_orgs(id) ON DELETE SET NULL,
  role workshop_space_role NOT NULL DEFAULT 'participant',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workshop_space_members_space ON workshop_space_members(space_id);
CREATE INDEX IF NOT EXISTS idx_workshop_space_members_user ON workshop_space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workshop_space_members_org ON workshop_space_members(np_org_id);

-- Create workshop_proposals
CREATE TABLE IF NOT EXISTS workshop_proposals (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES workshop_workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  proposed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status proposal_status NOT NULL DEFAULT 'draft',
  decision_notes_markdown TEXT,
  decided_at TIMESTAMPTZ,
  decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  superseded_by_proposal_id INTEGER REFERENCES workshop_proposals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_proposals_space ON workshop_proposals(space_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workshop_proposals_status ON workshop_proposals(space_id, status);

-- Extend workshop_documents with versioning and e4a_turnarounds
ALTER TABLE workshop_documents
  ADD COLUMN IF NOT EXISTS previous_version_id INTEGER REFERENCES workshop_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS e4a_turnarounds TEXT[];

CREATE INDEX IF NOT EXISTS idx_workshop_documents_version ON workshop_documents(previous_version_id);

-- Extend workshop_projects with e4a_turnarounds
ALTER TABLE workshop_projects
  ADD COLUMN IF NOT EXISTS e4a_turnarounds TEXT[];

-- Create workshop_civic_links
CREATE TABLE IF NOT EXISTS workshop_civic_links (
  id SERIAL PRIMARY KEY,
  space_id INTEGER NOT NULL REFERENCES workshop_workspaces(id) ON DELETE CASCADE,
  linked_entity_type TEXT NOT NULL, -- civic_action, civic_campaign, petition
  linked_entity_id INTEGER NOT NULL,
  link_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_civic_links_space ON workshop_civic_links(space_id);
CREATE INDEX IF NOT EXISTS idx_workshop_civic_links_entity ON workshop_civic_links(linked_entity_type, linked_entity_id);
