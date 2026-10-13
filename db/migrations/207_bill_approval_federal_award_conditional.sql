-- 207: correction to migration 206's CA008 trigger, caught before any route code depends on it.
-- org_enforce_bill_approval_separation_of_duties() as first written blocks self-approval
-- unconditionally -- but that contradicts this system's own established design philosophy
-- (org_ledger_approval_policies / approval.html: "deliberately light-touch by default... the
-- one exception -- real-time, mandatory sign-off -- is reserved for transactions against a
-- grant flagged as a federal award"). The Ledger's own CA005 gate achieves this not by checking
-- federal-award status inside the trigger, but structurally: approved_by is only ever touched
-- on transactions born pending_approval, which itself only happens for federal-award lines --
-- an ordinary transaction never reaches the trigger at all.
--
-- Bills can't rely on that same structural trick, because every bill (federal or not) moves
-- through the same Draft -> Pending Approval -> Approved lifecycle -- Pending Approval is a
-- normal workflow stage for all bills, not a federal-only detour. So the condition has to be
-- explicit here: only reject self-approval when the bill actually touches an is_federal_award
-- grant. A same-person Approved transition on an ordinary bill (e.g. a small org's one admin
-- approving a $20 office-supplies bill) must stay allowed, matching how every other transaction
-- in this system stays unrestricted outside the one federal case.

CREATE OR REPLACE FUNCTION org_enforce_bill_approval_separation_of_duties() RETURNS trigger AS $$
BEGIN
  IF NEW.approved_by IS NOT NULL AND NEW.approved_by = NEW.created_by
     AND EXISTS (
       SELECT 1 FROM org_bill_lines bl
       JOIN org_grants g ON g.id = bl.grant_id
       WHERE bl.bill_id = NEW.id AND g.is_federal_award IS TRUE
     )
  THEN
    RAISE EXCEPTION 'org_bills % touches a federal-award grant and cannot be approved by the same user who created it (created_by = approved_by = %)', NEW.id, NEW.approved_by
      USING ERRCODE = 'CA008';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
