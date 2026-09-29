-- 222: Bills gain partial-payment support, matching invoices (already built rev 73). Bills were
-- deliberately built pay-in-full-only at first, matching the schema's original lack of a
-- partially_paid status -- reversed now that real Find & Match-style multi-select (ticking
-- several bills against one bank line) needs both sides to support partial amounts.
-- org_bill_payments itself needs no change -- amount_cents there was always a free-form
-- positive integer; the full-total-only behavior was purely in application code
-- (recordBillPayment), not the schema.

ALTER TABLE org_bills DROP CONSTRAINT org_bills_status_check;
ALTER TABLE org_bills ADD CONSTRAINT org_bills_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'scheduled'::text, 'partially_paid'::text, 'paid'::text, 'void'::text]));
