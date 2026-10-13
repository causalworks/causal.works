-- 304: Notes and history on contacts (org_constituents), alongside bills, invoices and ledger entries.
ALTER TABLE org_record_notes DROP CONSTRAINT org_record_notes_type_check;
ALTER TABLE org_record_notes ADD CONSTRAINT org_record_notes_type_check CHECK (record_type IN ('bill', 'invoice', 'ledger_transaction', 'contact'));
