-- 224: Bills gain a real path to the schema's existing 'scheduled' status, previously unreachable
-- (flagged as a known gap in DevPath rev 73/75) -- an approved bill can be scheduled for a future
-- payment date, then paid (or unscheduled back to approved) when that date arrives. Deliberately
-- manual on both ends for this pass: no cron job auto-executes the payment on the scheduled date
-- -- that would move real money unattended, a materially different feature than making the status
-- reachable, and not something to add without an explicit decision to build it.

ALTER TABLE org_bills ADD COLUMN scheduled_payment_date date;

COMMENT ON COLUMN org_bills.scheduled_payment_date IS 'Set when status transitions approved -> scheduled via POST .../bills/:id/schedule; cleared on unschedule (back to approved) or on payment. Purely informational/organizational -- no automated job acts on this date.';
