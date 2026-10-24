-- Audit writes that failed in application code; read on the platform admin page.
CREATE TABLE IF NOT EXISTS platform_audit_failures (
  id          BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id      INTEGER,
  user_id     INTEGER,
  action      TEXT,
  table_name  TEXT,
  record_id   INTEGER,
  error       TEXT,
  reviewed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS platform_audit_failures_open_idx ON platform_audit_failures (occurred_at) WHERE reviewed_at IS NULL;
GRANT SELECT, INSERT, UPDATE ON platform_audit_failures TO causal_app;
GRANT USAGE, SELECT ON SEQUENCE platform_audit_failures_id_seq TO causal_app;
