-- 238: Expense claims -- receipt latitude (org-configurable threshold + missing-receipt
-- affidavit) and a per-claim message thread between submitter and admin/board.
--
-- Triggered by live review of the just-shipped Expense Claims feature: requiring a receipt
-- unconditionally before submit doesn't match real submitter behavior (people submit before
-- finding the receipt, and reimbursement often needs to happen before it turns up). Researched
-- the actual rule first: IRS accountable-plan rules require documentary evidence only for
-- lodging and any single expense >= $75 -- nothing below that needs a receipt under federal law.
-- But state law varies, so this migration does NOT default to the federal $75 figure -- the
-- threshold is admin-configurable, defaulting to $0 (preserves today's strict behavior until an
-- admin explicitly loosens it). See .claude/plans/archive/2026-09-14-board-designated-funds-and-expense-claims-edit.md, Part C.

ALTER TABLE org_settings
  ADD COLUMN expense_claim_receipt_required_threshold_cents integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN org_settings.expense_claim_receipt_required_threshold_cents IS
  'Claims with a total below this amount can submit without a receipt or affidavit. Defaults to 0 (today''s strict behavior: always require one) -- deliberately not defaulted to the IRS federal $75 floor, since state law varies and this is the org''s/bookkeeper''s call, not a platform default.';

-- Mirrors the existing approved_by/approved_at, confirmed_by/confirmed_at pair pattern already
-- on this table.
ALTER TABLE org_expense_claims
  ADD COLUMN receipt_affidavit_reason text,
  ADD COLUMN receipt_affidavit_at timestamp with time zone,
  ADD COLUMN receipt_affidavit_by integer REFERENCES users(id),
  ADD COLUMN receipt_follow_up_due date,
  ADD COLUMN receipt_resolved_at timestamp with time zone;

COMMENT ON COLUMN org_expense_claims.receipt_affidavit_at IS
  'Set when the claimant self-certifies a missing-receipt affidavit (structured, not a freeform note) to submit a claim at/above the org''s receipt threshold without an actual receipt attached. Does not change claim status -- submit is still a separate action.';
COMMENT ON COLUMN org_expense_claims.receipt_resolved_at IS
  'Set automatically when a real receipt document is later attached to this claim (see documents.js POST handler), clearing the outstanding-affidavit Attention Feed item.';

CREATE TABLE org_expense_claim_messages (
  id SERIAL PRIMARY KEY,
  claim_id integer NOT NULL REFERENCES org_expense_claims(id) ON DELETE CASCADE,
  author_user_id integer NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX idx_org_expense_claim_messages_claim ON org_expense_claim_messages (claim_id);

-- No org_id column on this table -- RLS via EXISTS-join to org_expense_claims, same pattern
-- org_expense_claim_lines already uses (migration 236).
ALTER TABLE org_expense_claim_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_expense_claim_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY org_expense_claim_messages_org_isolation ON org_expense_claim_messages
  USING (EXISTS (SELECT 1 FROM org_expense_claims c WHERE c.id = org_expense_claim_messages.claim_id
                 AND c.org_id = NULLIF(current_setting('app.current_org_id', true), '')::integer));

COMMENT ON TABLE org_expense_claim_messages IS
  'Per-claim message thread between the claimant and admin/board (e.g. "still looking for the receipt, will upload by Friday"). Visible in-app on the claim; each new message also triggers a best-effort outbound email notification to the other party (see sendExpenseClaimMessageEmail.js) -- outbound only, no inbound-email parsing.';
