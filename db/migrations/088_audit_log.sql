-- Migration 088: Audit log for user-initiated financial data changes
-- Covers coop_budget_lines, coop_schedule_items, coop_schedules.
-- Append-only by convention — application code never UPDATEs or DELETEs rows.
-- Do NOT log recalc writes (scheduleRecalc.js bulk operations).

CREATE TABLE coop_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  coop_org_id   INTEGER NOT NULL REFERENCES coop_orgs(id),
  user_id       INTEGER,
  action        TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  table_name    TEXT NOT NULL,
  record_id     BIGINT NOT NULL,
  field_name    TEXT,        -- NULL for create/delete of whole record
  old_value     TEXT,
  new_value     TEXT,
  metadata      JSONB,       -- request context: ip, user_agent, etc.
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_org_table_record ON coop_audit_log (coop_org_id, table_name, record_id);
CREATE INDEX idx_audit_log_occurred_at ON coop_audit_log (occurred_at);
