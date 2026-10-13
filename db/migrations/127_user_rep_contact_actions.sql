-- Manual link between a Moves action and a rep the user picked to contact about it,
-- replacing the auto-matching approach (committee/turnaround inference, rep_targets
-- name-matching, keyword guessing) that kept producing wrong or missing matches.
CREATE TABLE IF NOT EXISTS user_rep_contact_actions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rep_id INTEGER NOT NULL REFERENCES representatives(id) ON DELETE CASCADE,
  action_id INTEGER NOT NULL REFERENCES actions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  contacted_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  UNIQUE (user_id, rep_id, action_id)
);
CREATE INDEX IF NOT EXISTS idx_user_rep_contact_actions_user ON user_rep_contact_actions(user_id);
