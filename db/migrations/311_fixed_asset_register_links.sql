-- The fixed asset register owns the fixed asset accounts: every entry that adds cost to one of them is turned into
-- a register asset (linked to that entry), and depreciation the books already hold from before the register is
-- recorded on the asset so the register's total equals the books' total.
ALTER TABLE org_fixed_assets
  ADD COLUMN IF NOT EXISTS acquisition_ledger_transaction_id integer REFERENCES org_ledger_transactions(id),
  ADD COLUMN IF NOT EXISTS prior_depreciation_cents bigint NOT NULL DEFAULT 0 CHECK (prior_depreciation_cents >= 0),
  ADD COLUMN IF NOT EXISTS prior_depreciation_through date;
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_fixed_assets_acquisition_txn
  ON org_fixed_assets (acquisition_ledger_transaction_id) WHERE acquisition_ledger_transaction_id IS NOT NULL;
