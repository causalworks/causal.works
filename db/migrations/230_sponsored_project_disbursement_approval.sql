-- Fiscal sponsorship Phase 3: the actual compliance-critical piece for Standard (pass-
-- through, model_c) sponsored projects. Migration 227 shipped disbursement tracking with no
-- approval step at all -- a sponsor that doesn't genuinely review project spending risks the
-- IRS reading that as evidence it doesn't actually control the funds (undermining variance
-- power, the legal basis for the donor's gift being deductible to the sponsor at all).
--
-- Deliberately NOT the same shape as the federal-award gate (org_enforce_bill_approval_
-- separation_of_duties, migration 207): that trigger blocks a same-user approve specifically
-- because 2 CFR 200.303's internal-controls mandate requires it. Variance power carries no
-- such requirement -- it just requires genuine review and the ability to say no, not a
-- different person than whoever entered the request. This codebase's own established
-- philosophy is "deliberately light-touch by default... mandatory sign-off reserved for the
-- federal-award case" (migration 207's own comment) -- a hard separation-of-duties
-- requirement here would contradict that precedent, not follow it. What actually matters:
-- every disbursement starts pending_approval and requires a distinct, deliberate approve
-- action before it's real -- no auto-posting, whether the approver is the same person or not.
ALTER TABLE public.org_sponsored_project_disbursements
  ADD COLUMN status text NOT NULL DEFAULT 'pending_approval',
  ADD COLUMN approved_by integer,
  ADD COLUMN approved_at timestamp with time zone;

ALTER TABLE public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_status_check
  CHECK (status IN ('pending_approval', 'approved', 'void'));

ALTER TABLE public.org_sponsored_project_disbursements
  ADD CONSTRAINT org_sponsored_project_disbursements_approved_by_fkey
  FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.org_sponsored_project_disbursements.status IS
  'pending_approval (default, on create) -> approved (via a distinct /approve action) or void. Only approved disbursements count toward tracking totals -- a pending one is not yet real money out the door for reporting purposes.';
