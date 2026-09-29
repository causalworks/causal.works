-- Migration 116 backfilled orgs.added_by_user_id by blindly name-matching against
-- user_contributed_orgs, with no requirement that the org actually originated from
-- that user. Several matches turned out to be a user privately re-adding an org that
-- already existed as an independently admin-seeded/verified platform org (Eko, 350.org,
-- Sierra Club, Sunrise Movement, Asheville Creative Arts Inc) — those users' private
-- rows were redundant, not the org's origin. Corrects to require corroborating evidence
-- in org_suggestions (an actual suggestion by that user), which is a much stronger
-- signal of "this user brought the org onto the platform."
--
-- orgs.id = 12 (ACLU) is excluded: its added_by_user_id predates migration 116 and was
-- set through a different, unrelated mechanism — not touched here.

UPDATE orgs o
SET added_by_user_id = NULL
WHERE o.added_by_user_id IS NOT NULL
  AND o.id <> 12
  AND NOT EXISTS (
    SELECT 1 FROM org_suggestions s
    WHERE s.user_id = o.added_by_user_id
      AND regexp_replace(regexp_replace(lower(s.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
        = regexp_replace(regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
  );

-- Remove now-redundant private contributed-org rows for orgs that are confirmed
-- platform orgs (added_by_user_id cleared above, or never set) — these were only
-- ever used to force a false "user added" categorization.
DELETE FROM user_contributed_orgs uco
WHERE EXISTS (
  SELECT 1 FROM orgs o
  WHERE o.added_by_user_id IS NULL
    AND regexp_replace(regexp_replace(lower(o.name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
      = regexp_replace(regexp_replace(lower(uco.org_name), '[^a-z0-9]', '', 'g'), '(org|com|net)$', '')
);
