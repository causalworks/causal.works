-- 199: Ledger V1 Phase 5 -- approval-policy record + the one hard gate the spec keeps for V1
-- (Ledger_Module_V1_Spec.md Section 5): real-time second-approver sign-off, but ONLY for
-- transactions touching an org_grants.is_federal_award=true grant (2 CFR 200.303). Everything
-- else in V1 stays permissive-by-default -- no blocking workflow for ordinary transactions.

-- ---------------------------------------------------------------------------
-- 1. org_ledger_transactions: a third status for the one gated case, plus who/when approved it.
-- ---------------------------------------------------------------------------

ALTER TABLE org_ledger_transactions DROP CONSTRAINT org_ledger_transactions_status_check;
ALTER TABLE org_ledger_transactions ADD CONSTRAINT org_ledger_transactions_status_check
  CHECK (status = ANY (ARRAY['posted'::text, 'voided'::text, 'pending_approval'::text]));

ALTER TABLE org_ledger_transactions
  ADD COLUMN approved_by integer REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN approved_at timestamp with time zone;

COMMENT ON COLUMN org_ledger_transactions.approved_by IS
  'Set only for transactions that required the federal-award approval gate (a line tagged to an org_grants.is_federal_award=true grant). NULL for every ordinary transaction -- V1 has no blocking approval workflow otherwise.';

-- Separation of duties: the same user cannot both create and approve a gated transaction.
-- Real-time gate, not advisory -- enforced at the DB level like everything else in this set.
CREATE OR REPLACE FUNCTION org_enforce_ledger_approval_separation_of_duties() RETURNS trigger AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.created_by THEN
    RAISE EXCEPTION 'org_ledger_transactions % cannot be approved by the same user who created it (created_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA005';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_transactions_approval_separation_of_duties
  BEFORE UPDATE OF approved_by ON org_ledger_transactions
  FOR EACH ROW EXECUTE FUNCTION org_enforce_ledger_approval_separation_of_duties();

-- ---------------------------------------------------------------------------
-- 2. Approval-policy record -- org-level, structured, one row per org (matches the org_settings
-- shape). "Exportable as a dated document for a CPA/auditor" per spec Section 5 -- the export
-- itself is generated on request by the route layer (reuses the existing boardReportHtml-style
-- HTML-document pattern from reports.js), not stored; this table just holds the current policy.
-- ---------------------------------------------------------------------------

CREATE TABLE org_ledger_approval_policies (
  org_id integer PRIMARY KEY REFERENCES coop_members(id) ON DELETE CASCADE,
  reviewer_role text,
  review_cadence text,
  description text,
  flagged_amount_threshold_cents bigint DEFAULT 500000 NOT NULL,
  updated_by integer REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT org_ledger_approval_policies_threshold_non_negative CHECK (flagged_amount_threshold_cents >= 0)
);

COMMENT ON COLUMN org_ledger_approval_policies.flagged_amount_threshold_cents IS
  'Default $5,000 -- an org-configurable starting point for the flagged-transaction review package, not a hard rule.';

ALTER TABLE org_ledger_approval_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_ledger_approval_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY org_ledger_approval_policies_org_isolation ON org_ledger_approval_policies
  USING ((org_id = NULLIF(current_setting('app.current_org_id'::text, true), '')::integer));
