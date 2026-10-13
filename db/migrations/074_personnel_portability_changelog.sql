-- Add payroll portability fields and audit changelog

-- Add columns to np_personnel
ALTER TABLE np_personnel ADD COLUMN payroll_id TEXT;
ALTER TABLE np_personnel ADD COLUMN department_code TEXT;
ALTER TABLE np_personnel ADD COLUMN flsa_status TEXT DEFAULT 'exempt'
  CHECK (flsa_status IN ('exempt', 'non-exempt', 'hourly-non-exempt'));

-- Create changelog table for audit trail
CREATE TABLE np_personnel_changes (
  id              BIGSERIAL PRIMARY KEY,
  np_org_id       INTEGER NOT NULL REFERENCES np_orgs(id) ON DELETE CASCADE,
  np_personnel_id BIGINT REFERENCES np_personnel(id) ON DELETE SET NULL,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action          TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  field_name      TEXT,           -- NULL for create/delete (whole-record actions)
  old_value       TEXT,
  new_value       TEXT,
  memo            TEXT,           -- optional context
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX np_personnel_changes_worker ON np_personnel_changes(np_personnel_id, changed_at DESC);
CREATE INDEX np_personnel_changes_org    ON np_personnel_changes(np_org_id, changed_at DESC);
