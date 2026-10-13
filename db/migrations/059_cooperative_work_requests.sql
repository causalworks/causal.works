-- 059: Create cooperative work requests table
CREATE TYPE cooperative_work_category AS ENUM (
  'bookkeeping',
  'grant_writing',
  '990_prep',
  'board_reporting',
  'financial_analysis',
  'other'
);

CREATE TYPE cooperative_work_status AS ENUM (
  'open',
  'in_progress',
  'completed',
  'cancelled'
);

CREATE TABLE IF NOT EXISTS cooperative_work_requests (
  id SERIAL PRIMARY KEY,
  np_org_id INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  category cooperative_work_category NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  hours_estimate NUMERIC(5,1) NOT NULL,
  needed_by DATE,
  status cooperative_work_status NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cooperative_work_requests_org ON cooperative_work_requests (np_org_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_work_requests_status ON cooperative_work_requests (status, created_at DESC);
