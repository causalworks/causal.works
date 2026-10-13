-- Migration: rep_votes_cache table for storing voting records
-- Phase 2: Voting record layer — cache roll-call votes linked to classified bills

CREATE TABLE IF NOT EXISTS rep_votes_cache (
  id SERIAL PRIMARY KEY,
  bioguide_id TEXT NOT NULL,
  vote_id TEXT NOT NULL,
  bill_id TEXT NOT NULL REFERENCES bills_cache(bill_id),
  chamber TEXT NOT NULL,
  vote_date DATE,
  question TEXT,
  position TEXT NOT NULL,
  is_substantive BOOLEAN DEFAULT true,
  source TEXT DEFAULT 'congress.gov',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rep_votes_bioguide ON rep_votes_cache(bioguide_id);
CREATE INDEX idx_rep_votes_bill ON rep_votes_cache(bill_id);
CREATE INDEX idx_rep_votes_date ON rep_votes_cache(vote_date DESC);
CREATE UNIQUE INDEX idx_rep_votes_unique ON rep_votes_cache(bioguide_id, vote_id);
