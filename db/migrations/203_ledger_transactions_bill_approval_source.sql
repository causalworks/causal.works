-- 203: Purchases/Sales V1, fix 1 of 4 (double-gate). postLedgerTransaction's federal-award
-- gate (migration 199) is unconditional today -- it always sets a new transaction's status to
-- 'pending_approval' when any line touches an is_federal_award grant, with no way for a caller
-- to indicate the check was already satisfied elsewhere. Bills need exactly that: a bill against
-- a federal-award grant goes through its OWN separation-of-duties approval (org_bills.approved_by,
-- its own CA008 trigger -- see the Bills migration) BEFORE the liability is posted. Without a
-- bypass, the resulting ledger transaction would be born pending_approval anyway, forcing a
-- second, redundant sign-off on the Transactions tab after the Bill was already approved.
--
-- This is deliberate, not a shortcut: the bypass is a JS-only parameter on postLedgerTransaction
-- (see ledgerPosting.js), never read from request input, only ever set by trusted server-side
-- code (the Bill-approval route) after its own gate has already passed. It does not weaken the
-- gate for ordinary manual/bank-reconciliation transactions, which still go through the normal
-- unconditional check. To keep the bypass traceable rather than a silent skip, the resulting
-- transaction records who/when approved it (reusing org_ledger_transactions.approved_by/
-- approved_at from migration 199) and which record triggered the bypass, via a new generic
-- source_ref_id/source_ref_type pair -- same convention already used on org_budget_lines and
-- org_schedule_items, rather than a bill-specific column that would need a second one for
-- invoices later.

ALTER TABLE org_ledger_transactions
  ADD COLUMN source_ref_id bigint,
  ADD COLUMN source_ref_type text;

COMMENT ON COLUMN org_ledger_transactions.source_ref_id IS
  'Set only when this transaction was posted on behalf of another record (e.g. a Bill at Approval) rather than entered directly. Paired with source_ref_type.';
COMMENT ON COLUMN org_ledger_transactions.source_ref_type IS
  'Discriminator for source_ref_id, e.g. ''bill''. NULL for ordinary manual/bank_reconciliation transactions.';

ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_source_check;
ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'bank_reconciliation'::text, 'bill_approval'::text]));
