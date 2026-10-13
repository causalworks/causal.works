-- 141_local_event_attendance.sql
-- "Did you attend?" tracking for real local events (Mobilize etc.) shown on
-- the Attend tab. These events are fetched live on every /api/local/feed
-- request and never persisted anywhere — unlike organizer attend-type asks,
-- which already live in `actions` and mark attendance via the existing
-- user_actions.completed_at flow (POST /api/actions/:id/done). This table is
-- the equivalent record for the other card type, so Ledger can count both.
CREATE TABLE IF NOT EXISTS local_event_attendance (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'mobilize',
  -- Mobilize events have no numeric id in what we capture today — browser_url
  -- (the event's own page) is stable and unique per event, so it's the key.
  event_key TEXT NOT NULL,
  title TEXT,
  org_name TEXT,
  event_date TIMESTAMPTZ,
  boundary_ids TEXT[] NOT NULL DEFAULT '{}',
  attended BOOLEAN NOT NULL,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source, event_key)
);

CREATE INDEX IF NOT EXISTS idx_local_event_attendance_user_attended
  ON local_event_attendance (user_id, attended);

COMMENT ON TABLE local_event_attendance IS 'User-reported "did you attend?" responses for real local events (Mobilize) on the Attend tab — the non-actions-table counterpart to user_actions.completed_at, since these events are never stored elsewhere.';
COMMENT ON COLUMN local_event_attendance.event_key IS 'Stable per-event identifier — currently the Mobilize browser_url. Upsert key alongside user_id + source.';
COMMENT ON COLUMN local_event_attendance.attended IS 'true = "Yes, I attended" (counts toward Ledger); false = "No" (dismisses the card from future feed loads, does not count).';
