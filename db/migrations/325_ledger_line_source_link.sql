-- Each ledger line made from a bill or invoice line points back at that source line.
ALTER TABLE org_ledger_lines ADD COLUMN IF NOT EXISTS source_line_type text;
ALTER TABLE org_ledger_lines ADD COLUMN IF NOT EXISTS source_line_id integer;
ALTER TABLE org_ledger_lines DROP CONSTRAINT IF EXISTS org_ledger_lines_source_line_type_check;
ALTER TABLE org_ledger_lines ADD CONSTRAINT org_ledger_lines_source_line_type_check
  CHECK ((source_line_type IS NULL AND source_line_id IS NULL)
      OR (source_line_type IN ('org_bill_lines', 'org_invoice_lines') AND source_line_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_org_ledger_lines_source_line ON org_ledger_lines (source_line_type, source_line_id)
  WHERE source_line_type IS NOT NULL;

-- The backfill changes only the link columns, so the fiscal-year lock, the change log and the actuals recompute are skipped for it.
ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_fy_lock_ledger_lines;
ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_org_ledger_lines_audit;
ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_ledger_lines_recompute_actuals;

-- Backfill bills: bill line n matches ledger line n (by id) on account and amount; the last ledger line is the payable.
WITH bl AS (
  SELECT b.id AS bill_id, b.ledger_transaction_id AS txn, l.id AS line_id, l.account_id, l.amount_cents,
         row_number() OVER (PARTITION BY b.id ORDER BY l.id) AS rn,
         count(*) OVER (PARTITION BY b.id) AS n
    FROM org_bills b JOIN org_bill_lines l ON l.bill_id = b.id
   WHERE b.ledger_transaction_id IS NOT NULL
), ll AS (
  SELECT id, transaction_id, account_id, debit_cents,
         row_number() OVER (PARTITION BY transaction_id ORDER BY id) AS rn,
         count(*) OVER (PARTITION BY transaction_id) AS n
    FROM org_ledger_lines
), pairs AS (
  SELECT bl.bill_id, bl.line_id, ll.id AS ledger_line_id,
         (bl.account_id = ll.account_id AND bl.amount_cents = ll.debit_cents AND ll.n = bl.n + 1) AS ok
    FROM bl JOIN ll ON ll.transaction_id = bl.txn AND ll.rn = bl.rn
), good AS (
  SELECT * FROM pairs p WHERE NOT EXISTS (SELECT 1 FROM pairs q WHERE q.bill_id = p.bill_id AND NOT q.ok)
)
UPDATE org_ledger_lines l SET source_line_type = 'org_bill_lines', source_line_id = g.line_id
  FROM good g WHERE l.id = g.ledger_line_id;

-- Backfill invoices without a quid-pro-quo split: ledger line 1 is the receivable, lines 2..n+1 are the invoice lines.
WITH il AS (
  SELECT i.id AS invoice_id, i.ledger_transaction_id AS txn, l.id AS line_id, l.account_id,
         round(l.quantity * l.unit_amount_cents)::bigint AS amt,
         row_number() OVER (PARTITION BY i.id ORDER BY l.id) AS rn,
         count(*) OVER (PARTITION BY i.id) AS n,
         bool_or(l.fair_market_value_cents IS NOT NULL) OVER (PARTITION BY i.id) AS has_split
    FROM org_invoices i JOIN org_invoice_lines l ON l.invoice_id = i.id
   WHERE i.ledger_transaction_id IS NOT NULL
), ll AS (
  SELECT id, transaction_id, account_id, credit_cents,
         row_number() OVER (PARTITION BY transaction_id ORDER BY id) AS rn,
         count(*) OVER (PARTITION BY transaction_id) AS n
    FROM org_ledger_lines
), pairs AS (
  SELECT il.invoice_id, il.line_id, ll.id AS ledger_line_id,
         (NOT il.has_split AND il.account_id = ll.account_id AND il.amt = ll.credit_cents AND ll.n = il.n + 1) AS ok
    FROM il JOIN ll ON ll.transaction_id = il.txn AND ll.rn = il.rn + 1
), good AS (
  SELECT * FROM pairs p WHERE NOT EXISTS (SELECT 1 FROM pairs q WHERE q.invoice_id = p.invoice_id AND NOT q.ok)
)
UPDATE org_ledger_lines l SET source_line_type = 'org_invoice_lines', source_line_id = g.line_id
  FROM good g WHERE l.id = g.ledger_line_id;

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_fy_lock_ledger_lines;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_org_ledger_lines_audit;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_ledger_lines_recompute_actuals;
