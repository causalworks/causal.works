CREATE UNIQUE INDEX IF NOT EXISTS uq_org_ledger_one_live_entry_per_disbursement
  ON org_ledger_transactions (org_id, source_ref_id)
  WHERE source_ref_type = 'org_sponsored_project_disbursements' AND status <> 'voided';
