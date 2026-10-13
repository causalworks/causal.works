-- Small organizations can let a board member approve disbursements (otherwise only admin or finance may).
-- Takes effect only while the organization has two or fewer workspace users who are admin or finance.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS board_may_approve boolean NOT NULL DEFAULT false;
