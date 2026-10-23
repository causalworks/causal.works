-- One live ledger entry per recall and per closing, one live reversal per entry, one live disbursement per payment request.

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ledger_one_live_entry_per_recall
  ON org_ledger_transactions (org_id, source_ref_id)
  WHERE source_ref_type = 'org_sponsor_recalls' AND status <> 'voided';

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ledger_one_live_entry_per_closing
  ON org_ledger_transactions (org_id, source_ref_id)
  WHERE source_ref_type = 'org_sponsor_closings' AND status <> 'voided';

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ledger_one_live_reversal
  ON org_ledger_transactions (org_id, reverses_transaction_id)
  WHERE reverses_transaction_id IS NOT NULL AND status <> 'voided';

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_sponsor_one_live_disbursement_per_request
  ON org_sponsored_project_disbursements (payment_request_id)
  WHERE payment_request_id IS NOT NULL AND status <> 'void';
