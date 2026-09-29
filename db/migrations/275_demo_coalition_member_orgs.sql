-- 275: demo member orgs for the CP2 coalition workshop and the Cooperative Members list.
--
-- Replaces 274's generic seats in the CP2 workshop with participants from several member orgs.
-- Org names follow a generic "<Type><N>" pattern (CommunityOrg1, AdvocacyGroup2, ...) so they can
-- never match a real organization; each has a reserved .example email domain. Participants are
-- labelled by role, with the org carried in workshop_space_members.org_id.
--
-- The orgs are coop_members rows flagged is_demo_fixture. The Members list shows fixtures only to
-- viewers in a platform-demo org, and hides them from everyone else (cooperative.js).

ALTER TABLE coop_members ADD COLUMN IF NOT EXISTS is_demo_fixture boolean NOT NULL DEFAULT false;

INSERT INTO coop_members (display_name, slug, member_since, membership_status, mission_summary, location_general, size_band, cooperative_turnarounds, is_demo_fixture)
VALUES
  ('CommunityOrg1',       'demo-communityorg1',       now() - interval '14 months', 'active', 'Neighborhood services and organizing for families near the industrial corridor.',        'Lake Charles, LA', '$500K-$1M',  ARRAY['poverty','inequality'],           true),
  ('AdvocacyGroup2',      'demo-advocacygroup2',      now() - interval '14 months', 'active', 'State and federal policy advocacy on energy permitting and public health.',              'Baton Rouge, LA',  '$250K-$500K', ARRAY['energy','inequality'],            true),
  ('MutualAidNetwork3',   'demo-mutualaidnetwork3',   now() - interval '11 months', 'active', 'Volunteer network coordinating food, transport, and emergency relief after storms.',     'Cameron Parish, LA','under $250K', ARRAY['food','poverty'],                true),
  ('FaithCoalition4',     'demo-faithcoalition4',     now() - interval '9 months',  'active', 'Congregations working together on climate stewardship and neighbor care.',             'Port Arthur, TX',  '$250K-$500K', ARRAY['energy','poverty'],              true),
  ('FisheriesCoop5',      'demo-fisheriescoop5',      now() - interval '9 months',  'active', 'Member-owned cooperative of small commercial fishers and shrimpers.',                  'Cameron Parish, LA','$500K-$1M',  ARRAY['food','inequality'],              true),
  ('LegalClinic6',        'demo-legalclinic6',        now() - interval '6 months',  'active', 'Environmental and civil-rights legal help for communities facing permitting decisions.','New Orleans, LA',  '$500K-$1M',  ARRAY['inequality','energy'],            true),
  ('YouthClimateGroup7',  'demo-youthclimategroup7',  now() - interval '4 months',  'active', 'Youth-led campaigns and storytelling on the Gulf Coast climate future.',               'Houston, TX',      'under $250K', ARRAY['energy','womens_empowerment'],    true)
ON CONFLICT (slug) DO NOTHING;

-- CP2 (space 43): replace 274's generic seats with the multi-org group.
DELETE FROM workshop_space_members WHERE space_id = 43 AND user_id IS NULL;

UPDATE workshop_space_members
   SET display_name = 'Coalition Convener', display_email = 'convener@democompany.example'
 WHERE space_id = 43 AND user_id = 2;
UPDATE workshop_space_members
   SET display_name = 'Program Director', display_email = 'programs@communityorg1.example',
       org_id = (SELECT id FROM coop_members WHERE slug = 'demo-communityorg1')
 WHERE space_id = 43 AND user_id = 4;

INSERT INTO workshop_space_members (space_id, user_id, org_id, role, display_name, display_email)
SELECT 43, NULL, c.id, 'participant', v.role_label, v.email
FROM (VALUES
  ('demo-advocacygroup2',     'Policy Director',      'policy@advocacygroup2.example'),
  ('demo-mutualaidnetwork3',  'Community Organizer',  'organizing@mutualaidnetwork3.example'),
  ('demo-faithcoalition4',    'Outreach Coordinator', 'outreach@faithcoalition4.example'),
  ('demo-fisheriescoop5',     'Member Liaison',       'liaison@fisheriescoop5.example'),
  ('demo-legalclinic6',       'Staff Attorney',       'attorney@legalclinic6.example'),
  ('demo-youthclimategroup7', 'Campaign Lead',        'campaigns@youthclimategroup7.example')
) AS v(slug, role_label, email)
JOIN coop_members c ON c.slug = v.slug;

-- CP2 thread messages: speakers from the member orgs.
UPDATE workshop_messages SET display_name = 'Coalition Convener', display_email = 'convener@democompany.example'
 WHERE thread_id = 4 AND display_name = 'Governance Lead';
UPDATE workshop_messages SET display_name = 'Member Liaison', display_email = 'liaison@fisheriescoop5.example'
 WHERE thread_id = 4 AND display_name = 'Program Director';

-- Getting Started (space 42): keep the cooperative-roles group, drop the two campaign-type seats
-- 274 added, and attribute the display-only seats to Demo Company.
DELETE FROM workshop_space_members WHERE space_id = 42 AND user_id IS NULL AND display_name IN ('Policy Director', 'Community Organizer');
UPDATE workshop_space_members SET org_id = 42 WHERE space_id = 42 AND org_id IS NULL;
