-- Standing positions against financial institutions (pension funds, asset managers)
-- Separate from bank_pledges (dollar-denominated divestment commitments).
-- These are act-based commitments: "I'll file a comment, attend the board meeting."
CREATE TABLE financial_rep_pledges (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  institution_key  TEXT NOT NULL,  -- fiduciary source_id, e.g. 'fiduciary:calpers'
  commitment_note  TEXT,           -- optional: what the user commits to do
  status           TEXT NOT NULL
                     CHECK(status IN ('committed', 'acted', 'withdrawn'))
                     DEFAULT 'committed',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, institution_key)
);

CREATE INDEX ON financial_rep_pledges(institution_key);
