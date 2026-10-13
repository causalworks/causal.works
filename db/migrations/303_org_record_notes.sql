-- 303: Notes on accounting records (bills, invoices, ledger entries). One row per note; the record is
-- named by record_type + record_id, the same way the audit log names it. Notes are never edited or deleted.

CREATE TABLE org_record_notes (
  id          serial PRIMARY KEY,
  org_id      integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  record_id   integer NOT NULL,
  body        text NOT NULL,
  created_by  integer REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_record_notes_type_check CHECK (record_type IN ('bill', 'invoice', 'ledger_transaction')),
  CONSTRAINT org_record_notes_body_check CHECK (length(btrim(body)) > 0)
);

CREATE INDEX idx_org_record_notes_record ON org_record_notes (org_id, record_type, record_id, created_at);

COMMENT ON TABLE org_record_notes IS 'Free-text notes on a bill, invoice or ledger entry. Append-only. History comes from org_audit_log, not this table.';

ALTER TABLE org_record_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_record_notes FORCE ROW LEVEL SECURITY;
CREATE POLICY org_record_notes_org_isolation ON org_record_notes
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);

GRANT SELECT, INSERT ON org_record_notes TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE org_record_notes_id_seq TO causal_app;
