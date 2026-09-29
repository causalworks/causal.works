-- Migration 107: Decision-centered action pipeline (additive, standalone)
--
-- Six new tables backing a machine-authored pipeline that reads multiple
-- sources, clusters them into decision records, scores leverage, and picks
-- one matched action per user. Does not touch `actions`, `orgs`, or any
-- other existing table. See server/decisions/ and public/decisions-inspect/.
--
-- Ownership by concern:
--   Intake            -> decision_crawl_targets, decision_evidence_items
--   Entity resolution -> decision_records, decision_evidence_links
--   Scoring/matching  -> decision_leverage_reads, decision_matched_actions

-- Intake: config for daily crawlers. org_id is display/attribution only —
-- never the source of truth for what to crawl (crawl targets are a property
-- of an intake source, not of an org).
CREATE TABLE IF NOT EXISTS decision_crawl_targets (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('org_page_crawl', 'civic_calendar')),
  url TEXT NOT NULL,
  label TEXT,
  org_id INTEGER REFERENCES orgs(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_crawl_targets_active
  ON decision_crawl_targets(source_type)
  WHERE active = true;

-- Intake: source-agnostic evidence. Every intake source (org-page crawl,
-- civic calendar, inbound-email mirror) writes this same shape.
CREATE TABLE IF NOT EXISTS decision_evidence_items (
  id SERIAL PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('org_page_crawl', 'civic_calendar', 'inbound_email')),
  source_url TEXT,
  source_ref_id INTEGER, -- polymorphic: actions.id for inbound_email, decision_crawl_targets.id for crawl sources
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_evidence_items_source
  ON decision_evidence_items(source_type, fetched_at DESC);

-- Entity resolution: the decision record itself. Never holds evidence
-- directly — evidence is only reachable via decision_evidence_links.
CREATE TABLE IF NOT EXISTS decision_records (
  id SERIAL PRIMARY KEY,
  anchor_who TEXT,
  anchor_what TEXT,
  anchor_when TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'proposal' CHECK (status IN ('proposal', 'canonical')),
  authored_by TEXT NOT NULL DEFAULT 'machine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_decision_records_status
  ON decision_records(status);

-- Entity resolution: reversible attachment of evidence to a decision record.
-- Merge/split a record by re-pointing rows here — evidence is never copied
-- or deleted as part of clustering.
CREATE TABLE IF NOT EXISTS decision_evidence_links (
  id SERIAL PRIMARY KEY,
  decision_record_id INTEGER NOT NULL REFERENCES decision_records(id) ON DELETE CASCADE,
  evidence_item_id INTEGER NOT NULL REFERENCES decision_evidence_items(id) ON DELETE CASCADE,
  confidence NUMERIC,
  authored_by TEXT NOT NULL DEFAULT 'machine',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_record_id, evidence_item_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_evidence_links_evidence
  ON decision_evidence_links(evidence_item_id);

-- Scoring: one leverage read per decision record, idempotent upsert.
CREATE TABLE IF NOT EXISTS decision_leverage_reads (
  id SERIAL PRIMARY KEY,
  decision_record_id INTEGER NOT NULL UNIQUE REFERENCES decision_records(id) ON DELETE CASCADE,
  boundary_ids TEXT[] NOT NULL DEFAULT '{}'::text[],
  turnaround_category TEXT,
  reasoning TEXT,
  score NUMERIC,
  authored_by TEXT NOT NULL DEFAULT 'machine',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Scoring: one matched action per (decision record, user), swappable —
-- updated in place rather than appended.
CREATE TABLE IF NOT EXISTS decision_matched_actions (
  id SERIAL PRIMARY KEY,
  decision_record_id INTEGER NOT NULL REFERENCES decision_records(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_text TEXT,
  action_type TEXT,
  reasoning TEXT,
  authored_by TEXT NOT NULL DEFAULT 'machine',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (decision_record_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_matched_actions_user
  ON decision_matched_actions(user_id);
