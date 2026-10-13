-- Source links for ledger lines made from expense claim lines and from in-kind gifts and pledge commitments.
ALTER TABLE org_ledger_lines DROP CONSTRAINT IF EXISTS org_ledger_lines_source_line_type_check;
ALTER TABLE org_ledger_lines ADD CONSTRAINT org_ledger_lines_source_line_type_check
  CHECK ((source_line_type IS NULL AND source_line_id IS NULL)
      OR (source_line_type IN ('org_bill_lines', 'org_invoice_lines', 'org_expense_claim_lines', 'org_gifts') AND source_line_id IS NOT NULL));

ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_fy_lock_ledger_lines;
ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_org_ledger_lines_audit;
ALTER TABLE org_ledger_lines DISABLE TRIGGER trg_ledger_lines_recompute_actuals;

WITH cl AS (
  SELECT c.id AS claim_id, c.ledger_transaction_id AS txn, l.id AS line_id, l.account_id, l.amount_cents,
         row_number() OVER (PARTITION BY c.id ORDER BY l.id) AS rn,
         count(*) OVER (PARTITION BY c.id) AS n
    FROM org_expense_claims c JOIN org_expense_claim_lines l ON l.claim_id = c.id
   WHERE c.ledger_transaction_id IS NOT NULL
), ll AS (
  SELECT id, transaction_id, account_id, debit_cents,
         row_number() OVER (PARTITION BY transaction_id ORDER BY id) AS rn,
         count(*) OVER (PARTITION BY transaction_id) AS n
    FROM org_ledger_lines
), pairs AS (
  SELECT cl.claim_id, cl.line_id, ll.id AS ledger_line_id,
         (cl.account_id = ll.account_id AND cl.amount_cents = ll.debit_cents AND ll.n = cl.n + 1) AS ok
    FROM cl JOIN ll ON ll.transaction_id = cl.txn AND ll.rn = cl.rn
), good AS (
  SELECT * FROM pairs p WHERE NOT EXISTS (SELECT 1 FROM pairs q WHERE q.claim_id = p.claim_id AND NOT q.ok)
)
UPDATE org_ledger_lines l SET source_line_type = 'org_expense_claim_lines', source_line_id = g.line_id
  FROM good g WHERE l.id = g.ledger_line_id;

UPDATE org_ledger_lines l SET source_line_type = 'org_gifts', source_line_id = g.id
  FROM org_gifts g
  JOIN org_ledger_transactions t ON t.id = g.ledger_transaction_id AND t.source IN ('gift_in_kind', 'pledge_commitment')
 WHERE l.transaction_id = t.id AND g.posting_status = 'posted';

SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_fy_lock_ledger_lines;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_org_ledger_lines_audit;
ALTER TABLE org_ledger_lines ENABLE TRIGGER trg_ledger_lines_recompute_actuals;
