-- 054: track dashboard visits for "Since your last visit"
ALTER TABLE np_org_users
  ADD COLUMN IF NOT EXISTS last_dashboard_visit_at TIMESTAMPTZ;
