-- Transaction entry types and journal reason (2026-10-04).
-- entry_type records which Accounting form created a manual entry: 'receive' and 'spend' (money in/out of a
-- bank account), 'transfer' (between bank accounts) or 'journal' (raw debits and credits). NULL for entries
-- made by other modules (bills, invoices, bank feed, depreciation...) and for older manual entries.
-- journal_reason is required by the API for every 'journal' entry: manual journals bypass the normal
-- bill/invoice/bank flows, so who did it and why must be answerable later (it also shows in the flagged review).

ALTER TABLE org_ledger_transactions
  ADD COLUMN IF NOT EXISTS entry_type text CHECK (entry_type IS NULL OR entry_type IN ('receive', 'spend', 'transfer', 'journal')),
  ADD COLUMN IF NOT EXISTS journal_reason text;

COMMENT ON COLUMN org_ledger_transactions.entry_type IS 'Which manual-entry form created this: receive, spend, transfer or journal. NULL for entries from other modules and older manual entries.';
COMMENT ON COLUMN org_ledger_transactions.journal_reason IS 'Required explanation for a manual journal entry (entry_type = journal).';
