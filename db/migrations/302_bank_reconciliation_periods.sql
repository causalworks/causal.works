-- 302: Month-end bank reconciliation periods. One row per bank or card account per period.
-- A draft period holds the statement balances typed so far; closing it locks the bank side of the
-- period (no unreconciling or re-matching of lines dated inside it) and stores a report snapshot.
-- Only the latest closed period of an account can be reopened, so periods stay in order.

CREATE TABLE org_bank_reconciliation_periods (
  id                       serial PRIMARY KEY,
  org_id                   integer NOT NULL REFERENCES coop_members(id) ON DELETE CASCADE,
  bank_account_id          integer NOT NULL REFERENCES org_accounts(id),
  period_start             date NOT NULL,
  period_end               date NOT NULL,
  opening_balance_cents    bigint NOT NULL,
  closing_balance_cents    bigint NOT NULL,
  status                   text NOT NULL DEFAULT 'draft',
  closed_at                timestamptz,
  closed_by                integer REFERENCES users(id) ON DELETE SET NULL,
  reopened_at              timestamptz,
  reopened_by              integer REFERENCES users(id) ON DELETE SET NULL,
  reopen_reason            text,
  report_snapshot          jsonb,
  created_by               integer REFERENCES users(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_bank_recon_periods_status_check CHECK (status IN ('draft', 'closed')),
  CONSTRAINT org_bank_recon_periods_dates_check CHECK (period_start <= period_end),
  CONSTRAINT org_bank_recon_periods_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
  CONSTRAINT org_bank_recon_periods_unique_end UNIQUE (org_id, bank_account_id, period_end)
);

CREATE INDEX idx_org_bank_recon_periods_account ON org_bank_reconciliation_periods (org_id, bank_account_id, period_end);

COMMENT ON TABLE org_bank_reconciliation_periods IS 'Month-end reconciliation per bank/card account. Closed = bank side locked and report_snapshot stored. Reopen only for the latest closed period of the account.';

ALTER TABLE org_bank_reconciliation_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bank_reconciliation_periods FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bank_reconciliation_periods_org_isolation ON org_bank_reconciliation_periods
  USING (org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer);
