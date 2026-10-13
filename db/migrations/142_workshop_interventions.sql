-- 142: Intervention Modeler — first of the six named-but-undesigned Workshop
-- tools to actually get built. A coalition logs and compares different ways
-- of trying to influence a real target decision, tagged by Meadows leverage
-- level and E4A turnaround, so it's visible when effort clusters at low
-- leverage while the real opportunity sits higher up.
--
-- leverage_level is a plain 1-12 integer (12=least leverage/"Numbers",
-- 1=most leverage/"Transcending paradigms") matching the client-side
-- MEADOWS_LEVELS hierarchy in public/individual/js/turnarounds.js — that
-- hierarchy has no server-side table or enum to join against, so this column
-- stores the same numbering directly rather than inventing a second encoding.
--
-- No status/workflow field yet — this is a comparison list, not a lifecycle
-- (see plan doc). Add status later if it turns out to be needed.

CREATE TABLE IF NOT EXISTS workshop_interventions (
  id SERIAL PRIMARY KEY,
  workshop_project_id INTEGER NOT NULL REFERENCES workshop_projects(id) ON DELETE CASCADE,
  target_action_id INTEGER REFERENCES actions(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  leverage_level INTEGER NOT NULL CHECK (leverage_level BETWEEN 1 AND 12),
  turnaround_ids TEXT[],
  effect_estimate TEXT NOT NULL DEFAULT '',
  proposed_by_member_id INTEGER REFERENCES workshop_space_members(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workshop_interventions_project ON workshop_interventions(workshop_project_id, leverage_level);
CREATE INDEX IF NOT EXISTS idx_workshop_interventions_target_action ON workshop_interventions(target_action_id);

-- ── Seed: three interventions against the CP2 LNG target (actions.id=467),
-- deliberately spanning the leverage hierarchy so the "coalition clustering
-- at low leverage while the real opportunity is higher up" pattern is
-- visible on first load. Attributed to three real seeded coalition members
-- (migration 132/136) rather than inventing new names.
--
-- Each intervention picks its proposer by a priority-ordered user_id list,
-- LIMIT 1, rather than by role — the "Community Organizer" (user_id 3) seat
-- from migration 132 is absent in some environments (that migration's
-- coop_orgs join has matched differently across runs), so a role-only match
-- like 'participant' could resolve to more than one member if both the
-- organizer and Regional Policy Director seats are populated.

WITH proposer_1 AS (
  SELECT m.id
  FROM workshop_space_members m
  JOIN workshop_workspaces w ON w.id = m.space_id
  JOIN workshop_projects p ON p.id = w.project_id
  WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
    AND m.user_id = ANY(ARRAY[3, 2, 4, 14])
  ORDER BY array_position(ARRAY[3, 2, 4, 14], m.user_id)
  LIMIT 1
)
INSERT INTO workshop_interventions (workshop_project_id, target_action_id, title, description, leverage_level, turnaround_ids, effect_estimate, proposed_by_member_id)
SELECT p.id,
       467,
       'Public comment volume campaign',
       'Mobilize as many individual public comments as possible into DOE''s docket (FE Docket No. 26-78-LNG) before the October 2, 2026 deadline — social posts, email templates, and a comment-drafting guide for supporters to personalize and submit on their own.',
       12,
       ARRAY['energy'],
       'Could generate several hundred individual comments. Public comment volume has no formal weight in DOE''s permit review criteria, so the effect on the actual decision is uncertain — this mainly demonstrates visible opposition rather than changing the approval calculus.',
       proposer_1.id
FROM workshop_projects p, proposer_1
WHERE p.slug = 'stop-cp2-lng-expansion'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_interventions i WHERE i.workshop_project_id = p.id AND i.title = 'Public comment volume campaign'
  );

WITH proposer_2 AS (
  SELECT m.id
  FROM workshop_space_members m
  JOIN workshop_workspaces w ON w.id = m.space_id
  JOIN workshop_projects p ON p.id = w.project_id
  WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
    AND m.user_id = ANY(ARRAY[4, 3, 14, 2])
  ORDER BY array_position(ARRAY[4, 3, 14, 2], m.user_id)
  LIMIT 1
)
INSERT INTO workshop_interventions (workshop_project_id, target_action_id, title, description, leverage_level, turnaround_ids, effect_estimate, proposed_by_member_id)
SELECT p.id,
       467,
       'Media pressure on cumulative Cameron Parish burden',
       'Pitch regional and trade press on the cumulative-impact angle — Cameron Parish already hosts a dense cluster of LNG terminals, and DOE''s review doesn''t appear to weigh that existing burden. Coverage aims to make each future approval politically costlier, slowing the reinforcing loop the workshop''s systems view already identified: each approved terminal makes the next one easier to justify.',
       7,
       ARRAY['energy', 'inequality'],
       'Coverage could shift how costly future approvals are politically, but doesn''t directly touch this permit''s review timeline or criteria — effect is indirect and plays out over multiple future permitting decisions, not this one.',
       proposer_2.id
FROM workshop_projects p, proposer_2
WHERE p.slug = 'stop-cp2-lng-expansion'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_interventions i WHERE i.workshop_project_id = p.id AND i.title = 'Media pressure on cumulative Cameron Parish burden'
  );

WITH proposer_3 AS (
  SELECT m.id
  FROM workshop_space_members m
  JOIN workshop_workspaces w ON w.id = m.space_id
  JOIN workshop_projects p ON p.id = w.project_id
  WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
    AND m.user_id = ANY(ARRAY[14, 2, 4, 3])
  ORDER BY array_position(ARRAY[14, 2, 4, 3], m.user_id)
  LIMIT 1
)
INSERT INTO workshop_interventions (workshop_project_id, target_action_id, title, description, leverage_level, turnaround_ids, effect_estimate, proposed_by_member_id)
SELECT p.id,
       467,
       'Push for a cumulative-impact review requirement in LNG permitting',
       'Advocate for DOE to adopt a standing rule requiring cumulative-impact assessment (existing local burden, not just this project in isolation) for any LNG export permit in an already-burdened parish — changing the permitting process itself, not just contesting this one terminal. If adopted, this applies to every future Gulf Coast LNG expansion, not only CP2.',
       5,
       ARRAY['energy', 'inequality', 'poverty'],
       'Slower to win and outside DOE''s comment-period timeline for this specific permit, so it likely doesn''t affect the CP2 decision itself — but a successful rule change would apply to every future terminal in the region, which is a categorically larger effect than anything achievable within this one docket.',
       proposer_3.id
FROM workshop_projects p, proposer_3
WHERE p.slug = 'stop-cp2-lng-expansion'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_interventions i WHERE i.workshop_project_id = p.id AND i.title = 'Push for a cumulative-impact review requirement in LNG permitting'
  );
