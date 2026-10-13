-- 263: add 'fundraising' to org_member_role, per the permissions matrix finalized 2026-09-21
-- (.claude/plans/2026-09-19-solid-odi-demo-readiness.md, "Permissions design finalized" section).
--
-- Donor/gift/campaign data has no program dimension in the schema (org_constituents/org_gifts
-- were never given a program_id), so treating it as program-scoped would mean a program-restricted
-- user seeing every donor in the org unfiltered -- the opposite of what scoping them is for.
-- A dedicated role sidesteps that instead of retrofitting a scoping dimension that isn't there.
--
-- Purely additive, same shape as migration 255's finance/program addition: no existing org_users
-- row is touched, no code path assigns this role yet. Route-level wiring (validation arrays,
-- fundraising-specific access checks on donors.js/giftPostings.js) is separate follow-up work,
-- not part of this migration.

ALTER TYPE org_member_role ADD VALUE 'fundraising';
