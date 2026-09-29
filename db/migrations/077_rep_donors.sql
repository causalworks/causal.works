-- Phase 3: Representative donor restrictions and contributions
-- Tracks which donors contribute to which reps and any restrictions they place

CREATE TABLE IF NOT EXISTS rep_donors (
  id SERIAL PRIMARY KEY,
  bioguide_id TEXT NOT NULL,
  donor_name TEXT NOT NULL,
  donor_sector TEXT,
  contribution_amount DECIMAL(12, 2),
  contribution_date DATE,
  restriction_description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup during Gemini analysis
CREATE INDEX IF NOT EXISTS idx_rep_donors_bioguide ON rep_donors(bioguide_id);
CREATE INDEX IF NOT EXISTS idx_rep_donors_sector ON rep_donors(donor_sector);
CREATE UNIQUE INDEX IF NOT EXISTS idx_rep_donors_unique ON rep_donors(bioguide_id, donor_name) WHERE restriction_description IS NOT NULL;
