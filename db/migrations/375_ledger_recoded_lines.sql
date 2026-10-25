-- 375: marks ledger lines that a live recode journal has already moved, so the same line cannot be recoded twice.

CREATE TABLE org_ledger_recoded_lines (
  line_id integer PRIMARY KEY REFERENCES org_ledger_lines(id) ON DELETE CASCADE,
  org_id integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  recode_transaction_id integer NOT NULL REFERENCES org_ledger_transactions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX org_ledger_recoded_lines_org_idx ON org_ledger_recoded_lines (org_id);
CREATE INDEX org_ledger_recoded_lines_txn_idx ON org_ledger_recoded_lines (recode_transaction_id);

ALTER TABLE org_ledger_recoded_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ledger_recoded_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY org_ledger_recoded_lines_org_isolation ON org_ledger_recoded_lines
  USING (org_id = (NULLIF(current_setting('app.current_org_id', true), ''))::integer);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_ledger_recoded_lines TO causal_app;
