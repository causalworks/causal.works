-- Gifts that arrive in the books first. A donation entered in Accounting (a Receive entry) creates a gift in Funding,
-- linked to the ledger entry, marked to confirm. Funding confirms it (or changes the donor, or says it is not a gift).
-- source: where the gift row started; review_status: whether Funding has looked at a gift that Accounting started.
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'funding';
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE org_gifts ADD COLUMN IF NOT EXISTS review_note TEXT;
ALTER TABLE org_gifts DROP CONSTRAINT IF EXISTS org_gifts_source_check;
ALTER TABLE org_gifts ADD CONSTRAINT org_gifts_source_check CHECK (source IN ('funding', 'accounting'));
ALTER TABLE org_gifts DROP CONSTRAINT IF EXISTS org_gifts_review_status_check;
ALTER TABLE org_gifts ADD CONSTRAINT org_gifts_review_status_check CHECK (review_status IN ('confirmed', 'to_confirm', 'dismissed'));
CREATE INDEX IF NOT EXISTS idx_org_gifts_review ON org_gifts (org_id, review_status) WHERE review_status = 'to_confirm';
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_gifts_accounting_entry ON org_gifts (ledger_transaction_id) WHERE source = 'accounting' AND ledger_transaction_id IS NOT NULL;
