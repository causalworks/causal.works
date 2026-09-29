-- Membership dues payments and sponsored-project disbursements currently have zero
-- connection to the ledger (found in the 2026-09-16 full org-module sweep -- same shape as
-- the pre-fix org_gifts gap). Both post through Bank Reconciliation's Match action, the same
-- "unposted item -> confirm against a real bank line" architecture as grant gifts (migration
-- 247) and bills -- never a fabricated entry with no real cash movement behind it.

-- Membership dues (money IN): a payment is recorded once cash has already been received, so
-- it becomes a credit-side match candidate (membership_dues, alongside the existing
-- grant_gift type) against the real deposit.
ALTER TABLE org_membership_payments
  ADD COLUMN posting_status text NOT NULL DEFAULT 'unposted',
  ADD CONSTRAINT org_membership_payments_posting_status_check
    CHECK (posting_status IN ('unposted', 'posted', 'void')),
  ADD COLUMN ledger_transaction_id integer REFERENCES org_ledger_transactions(id);

-- Revenue account + program are set per tier (mirrors org_grants.revenue_account_id) via the
-- same Bank Reconciliation inline picker used for grants with no default account yet --
-- Accounting sets the GL coding, not Membership, same segregation-of-duties precedent.
ALTER TABLE org_membership_tiers
  ADD COLUMN revenue_account_id integer REFERENCES org_accounts(id),
  ADD COLUMN program_id integer REFERENCES org_programs(id);

-- Sponsored project disbursements (money OUT): approval (existing pending_approval/approved/
-- void status, migration 230) is not itself a cash event -- the actual payment is a debit-side
-- match candidate (sponsored_project_disbursement, alongside the existing bill type) once
-- approved, matched against the real outgoing bank line.
ALTER TABLE org_sponsored_project_disbursements
  ADD COLUMN ledger_transaction_id integer REFERENCES org_ledger_transactions(id);

-- Expense account is set per sponsored project (mirrors org_grants.revenue_account_id /
-- org_membership_tiers.revenue_account_id above), same inline-picker-in-Accounting pattern.
ALTER TABLE org_sponsored_projects
  ADD COLUMN disbursement_expense_account_id integer REFERENCES org_accounts(id);
