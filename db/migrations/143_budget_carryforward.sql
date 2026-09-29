-- 143: Cross-fiscal-year carryforward wiring (Phase 1 of multi-year budget
-- planning). Lets a real, already-committed obligation that spans a fiscal
-- year boundary -- an insurance policy, a multi-year grant award, an ongoing
-- staff position -- leave a trace in next year's budget automatically,
-- instead of next year starting from nothing until someone manually builds
-- it. auto_generated distinguishes a row the system spawned from one a human
-- entered/edited: engines only ever touch their own auto_generated rows on
-- recalc, never a row a human has since claimed by editing it directly.

ALTER TABLE coop_schedule_items
  ADD COLUMN IF NOT EXISTS origin_item_id INTEGER REFERENCES coop_schedule_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN coop_schedule_items.origin_item_id IS 'Set when this row was auto-spawned into fiscal_year+1 (or beyond) from an insurance policy whose policy_end_date crosses the FY boundary; points back to the item that spawned it.';
COMMENT ON COLUMN coop_schedule_items.auto_generated IS 'TRUE until a human edits this row directly; the carryforward engine only ever creates/updates/deletes rows still TRUE here, never one a human has claimed.';

CREATE INDEX IF NOT EXISTS idx_coop_schedule_items_origin ON coop_schedule_items(origin_item_id) WHERE origin_item_id IS NOT NULL;

ALTER TABLE coop_grant_allocations
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN coop_grant_allocations.auto_generated IS 'TRUE when this FY allocation was auto-filled from the grant''s period_start_date/period_end_date + award amount (even split across missing years), rather than entered by a human. Flips FALSE on the first human edit.';

ALTER TABLE coop_personnel
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN coop_personnel.auto_generated IS 'TRUE when this fiscal_year''s row was auto-carried-forward from an ongoing position in fiscal_year-1 (same salary/FTE, no raise applied), rather than entered by a human.';

-- Cash-account identification (Phase 2 prerequisite, added here since it's a
-- single-column, low-risk addition and Phase 2 depends on it existing).
ALTER TABLE coop_accounts
  ADD COLUMN IF NOT EXISTS is_cash_account BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN coop_accounts.is_cash_account IS 'TRUE for bank/cash-equivalent asset accounts, used by cashflow forecasting to compute opening/closing cash position. Auto-set TRUE on Xero sync for accounts whose Xero Type is BANK; editable by staff for cash-equivalents Xero classifies differently.';
