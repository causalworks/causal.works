-- Closes the actual gap in fiscal sponsorship Phase 3: everything shipped so far tracks the
-- SPONSOR's money movement (revenue in, disbursement out, admin fee) but nothing tracked the
-- other half of IRC 4945(h) expenditure responsibility -- ongoing reports FROM the sponsee
-- on how the money was spent, and whether one is due/overdue. org_documents.
-- sponsored_project_id (migration 226) existed as a schema column but was never wired into
-- any upload route or UI -- inert, exactly the "found stored but never applied" pattern
-- caught repeatedly elsewhere in this codebase this session, this time missed in my own work
-- until asked directly.

ALTER TABLE public.org_sponsored_projects
  ADD COLUMN next_report_due date,
  ADD COLUMN last_report_received_at date;

COMMENT ON COLUMN public.org_sponsored_projects.next_report_due IS
  'When the sponsee''s next expenditure report is due -- the accountability half of IRC 4945(h), distinct from the money-tracking in org_sponsored_project_disbursements. Surfaced in the Needs Attention feed alongside grant/membership/document deadlines.';

-- New category for the sponsee's report itself, distinct from funder_report (which is this
-- org reporting UP to ITS OWN funder -- the opposite direction).
ALTER TYPE public.org_document_category ADD VALUE IF NOT EXISTS 'sponsee_report';
