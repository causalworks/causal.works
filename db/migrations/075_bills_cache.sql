-- Migration: bills_cache table for storing classified bills
-- Phase 2: Voting record layer — cache bills with E4A turnaround classifications

CREATE TABLE IF NOT EXISTS bills_cache (
  id SERIAL PRIMARY KEY,
  congress INTEGER NOT NULL,
  bill_id TEXT NOT NULL UNIQUE,
  title TEXT,
  summary TEXT,
  turnarounds TEXT[] DEFAULT '{}',
  classification_rationale TEXT,
  classified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bills_congress ON bills_cache(congress);
CREATE INDEX idx_bills_turnarounds ON bills_cache USING GIN(turnarounds);
