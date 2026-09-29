-- 214: Purchases/Sales V1, Section 6 (Documents extension). Confirmed in the earlier review:
-- org_documents.category is a closed enum and every prior "documents attach to X" feature
-- (grant_id -> org_grants, obligation_id -> org_compliance_obligations) added its own dedicated
-- nullable FK column. Adding a third and fourth single-purpose column (bill_id, invoice_id)
-- would repeat that pattern; instead this adds the generic source_ref_id/source_ref_type pair
-- already used elsewhere in this codebase (org_budget_lines, org_schedule_items) so a future
-- attachable record type doesn't need its own migration just to gain a FK column.

ALTER TYPE org_document_category ADD VALUE 'vendor_bill';
ALTER TYPE org_document_category ADD VALUE 'customer_invoice';
ALTER TYPE org_document_category ADD VALUE 'procurement_quote';
