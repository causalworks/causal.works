-- Date the credit note takes effect in the ledger.
ALTER TABLE org_bill_credit_notes ADD COLUMN IF NOT EXISTS note_date date;
ALTER TABLE org_invoice_credit_notes ADD COLUMN IF NOT EXISTS note_date date;
UPDATE org_bill_credit_notes SET note_date = created_at::date WHERE note_date IS NULL;
UPDATE org_invoice_credit_notes SET note_date = created_at::date WHERE note_date IS NULL;
