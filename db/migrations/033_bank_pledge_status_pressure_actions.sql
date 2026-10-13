-- 033: pledge lifecycle status + tracked pressure link opens
ALTER TABLE bank_pledges
  ADD COLUMN IF NOT EXISTS status TEXT;

UPDATE bank_pledges SET status = 'pledged' WHERE status IS NULL OR TRIM(status) = '';

ALTER TABLE bank_pledges
  ALTER COLUMN status SET DEFAULT 'pledged';

ALTER TABLE bank_pledges
  ALTER COLUMN status SET NOT NULL;

ALTER TABLE bank_pledges DROP CONSTRAINT IF EXISTS bank_pledges_status_check;
ALTER TABLE bank_pledges ADD CONSTRAINT bank_pledges_status_check
  CHECK (status IN ('pledged', 'partial_divest', 'divested'));

CREATE TABLE IF NOT EXISTS bank_pressure_actions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_name TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT bank_pressure_actions_action_type_check CHECK (action_type IN ('c4cj', 'bankgreen', 'third_act')),
  CONSTRAINT bank_pressure_actions_user_inst_action_uq UNIQUE (user_id, institution_name, action_type)
);

CREATE INDEX IF NOT EXISTS idx_bank_pressure_actions_institution_name
  ON bank_pressure_actions (institution_name);
