-- 121: Submission/approval workflow for the org-management library
-- (Management tab of Cooperative > Library). Reuses proposal_status (062)
-- and cooperative_library_category (058) rather than new enums.

CREATE TABLE IF NOT EXISTS cooperative_library_submissions (
  id SERIAL PRIMARY KEY,
  target_item_id INTEGER REFERENCES cooperative_library_items(id) ON DELETE SET NULL, -- NULL = new item proposal
  category cooperative_library_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  body_markdown TEXT NOT NULL,
  proposed_by_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  source_coop_org_id INTEGER REFERENCES coop_orgs(id) ON DELETE SET NULL,
  status proposal_status NOT NULL DEFAULT 'submitted',
  decision_notes TEXT,
  decided_at TIMESTAMPTZ,
  decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cooperative_library_submissions_status
  ON cooperative_library_submissions (status, created_at);
CREATE INDEX IF NOT EXISTS idx_cooperative_library_submissions_target
  ON cooperative_library_submissions (target_item_id);
