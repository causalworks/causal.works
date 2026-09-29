-- 223: Multi-select Find & Match (Xero's real behavior: tick several open bills/invoices against
-- one bank line, running total must equal the line exactly, each tick can carry a partial amount
-- now that bills support partial payment same as invoices -- migration 222). A single bank
-- statement line historically links to exactly one ledger transaction via its own
-- ledger_transaction_id column; multi-select match needs N ledger transactions (one per
-- recordBillPayment/recordInvoicePayment call, reusing the exact same shared posting lib as
-- everywhere else) against ONE statement line, which that singular column cannot represent.
--
-- Scope: this join table is used ONLY by the new multi-select match path. Single Match, Create,
-- and Transfer all keep writing the existing singular org_bank_statement_lines.ledger_transaction_id
-- column unchanged -- no other read path in the system needs to learn about this table.

CREATE TABLE org_bank_statement_line_postings (
  id                     serial PRIMARY KEY,
  statement_line_id      integer NOT NULL REFERENCES org_bank_statement_lines(id) ON DELETE CASCADE,
  ledger_transaction_id  integer NOT NULL REFERENCES org_ledger_transactions(id),
  amount_cents           bigint NOT NULL CHECK (amount_cents > 0),
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_org_bank_statement_line_postings_line ON org_bank_statement_line_postings (statement_line_id);
CREATE INDEX idx_org_bank_statement_line_postings_txn ON org_bank_statement_line_postings (ledger_transaction_id);

COMMENT ON TABLE org_bank_statement_line_postings IS 'One row per bill/invoice payment posted as part of a multi-select Find & Match confirmation on a single bank statement line. Single-item Match/Create/Transfer do not use this table -- they keep using org_bank_statement_lines.ledger_transaction_id directly.';

-- No org_id column of its own (same pattern as org_bill_lines) -- scoped via statement_line_id's
-- own org_id, since it always exists before a posting row can be created.
ALTER TABLE org_bank_statement_line_postings ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_bank_statement_line_postings FORCE ROW LEVEL SECURITY;
CREATE POLICY org_bank_statement_line_postings_org_isolation ON org_bank_statement_line_postings
  USING (EXISTS (
    SELECT 1 FROM org_bank_statement_lines l
    WHERE l.id = org_bank_statement_line_postings.statement_line_id
      AND l.org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer
  ));
