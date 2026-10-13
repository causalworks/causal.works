ALTER TABLE actions
  ADD COLUMN IF NOT EXISTS boundary_ids text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS boundary_urgency_score integer DEFAULT 0;
