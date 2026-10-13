-- A pledge installment collected through a Receive entry links to that entry, so the receipt and the installment
-- agree and voiding the entry reopens the installment.
ALTER TABLE org_gift_pledge_installments ADD COLUMN IF NOT EXISTS ledger_transaction_id INTEGER;
ALTER TABLE org_gift_pledge_installments ADD COLUMN IF NOT EXISTS collected_at DATE;
CREATE INDEX IF NOT EXISTS idx_pledge_installments_entry ON org_gift_pledge_installments (ledger_transaction_id) WHERE ledger_transaction_id IS NOT NULL;
