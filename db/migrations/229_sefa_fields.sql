-- SEFA (Schedule of Expenditures of Federal Awards) fields on org_grants -- Tier 4 item 11
-- of the 2026-09-13 comprehensive plan. Confirmed absent before this: only is_federal_award
-- (boolean) and free-text funder/funder_grant_id existed; nothing to actually produce a
-- compliant SEFA from.
--
-- Verified the real 2 CFR 200.510(b) field list before writing this (not just the plan's
-- shorthand "ALN / federal-awarding-agency / pass-through-amount") -- a SEFA needs BOTH
-- pass-through concepts, which are distinct:
--   (a) whether THIS org received the award indirectly, via a pass-through entity, rather
--       than directly from the federal agency (pass_through_entity_name +
--       pass_through_identifying_number) -- required per 200.510(b)(2), and the common case
--       for smaller nonprofits that get federal money via a state agency or another
--       nonprofit, not directly from a federal agency.
--   (b) the amount THIS org itself passes to ITS OWN subrecipients (Tier 4 item 11's
--       subrecipient-monitoring case -- e.g. a federally-funded Sponsored Project) --
--       required per 200.510(b)(4), separate from (a).
-- Schema-only pass, matching the plan's framing ("this one schema pass unlocks two
-- features") -- no SEFA report UI/PDF built yet.
ALTER TABLE public.org_grants
  ADD COLUMN federal_awarding_agency text,
  ADD COLUMN aln text,
  ADD COLUMN pass_through_entity_name text,
  ADD COLUMN pass_through_identifying_number text,
  ADD COLUMN amount_passed_to_subrecipients_cents bigint;

ALTER TABLE public.org_grants
  ADD CONSTRAINT org_grants_amount_passed_to_subrecipients_cents_check
  CHECK (amount_passed_to_subrecipients_cents IS NULL OR amount_passed_to_subrecipients_cents >= 0);

COMMENT ON COLUMN public.org_grants.aln IS
  'Assistance Listing Number (formerly CFDA number), format XX.XXX -- required on the SEFA for any is_federal_award grant.';
COMMENT ON COLUMN public.org_grants.pass_through_entity_name IS
  'Set only when this org received the award AS a subrecipient, i.e. NOT directly from the federal agency -- e.g. a state agency or another nonprofit passed it through. NULL means direct from the federal awarding agency.';
