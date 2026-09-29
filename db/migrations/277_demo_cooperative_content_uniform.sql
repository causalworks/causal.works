-- 277: make the rest of the Demo Company Cooperative content match the demo coalition
-- (roles only, generic "<Type>" org names, .example addresses; see 272-276).
-- Covers: Demo Company's address domain, workshop discussion, workshop proposals (Actions),
-- Work Pool requests, and the Library items that were placeholders or copies of the long
-- Getting Started text.

-- Demo Company's own seats use one address domain everywhere.
UPDATE workshop_space_members SET display_email = replace(display_email, '@democoop.example', '@democompany.example') WHERE display_email LIKE '%@democoop.example';
UPDATE workshop_messages      SET display_email = replace(display_email, '@democoop.example', '@democompany.example') WHERE display_email LIKE '%@democoop.example';

-- ── Discussion ──────────────────────────────────────────────────────────────
-- CP2 coalition (space 43)
WITH t AS (
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id, created_at, updated_at)
  VALUES (43, 'Who can testify at the DOE hearing?', 2, now() - interval '6 days', now() - interval '3 days')
  RETURNING id
)
INSERT INTO workshop_messages (thread_id, content, created_by_user_id, display_name, display_email, created_at)
SELECT t.id, v.content, NULL, v.name, v.email, now() - v.ago::interval
FROM t, (VALUES
  ('We can prepare written testimony on the cumulative-impact record and help two residents with their oral statements.', 'Staff Attorney',      'attorney@legalclinic.example',       '6 days'),
  ('Three residents from the parish are willing to speak. Two need transportation, and we can cover it.',                 'Community Organizer', 'organizing@mutualaidnetwork.example','5 days'),
  ('Could we hold a practice session in a congregation hall the week before the hearing?',                                 'Outreach Coordinator','outreach@faithcoalition.example',    '4 days'),
  ('Yes to all three. Let''s settle the practice-session date in this thread.',                                            'Coalition Convener',  'convener@democompany.example',       '3 days')
) AS v(content, name, email, ago);

WITH t AS (
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id, created_at, updated_at)
  VALUES (43, 'Shared talking points for press and social', 2, now() - interval '4 days', now() - interval '1 day')
  RETURNING id
)
INSERT INTO workshop_messages (thread_id, content, created_by_user_id, display_name, display_email, created_at)
SELECT t.id, v.content, NULL, v.name, v.email, now() - v.ago::interval
FROM t, (VALUES
  ('A one-page fact sheet and three social cards are ready for review by Friday.',                                   'Campaign Lead',    'campaigns@youthclimategroup.example', '4 days'),
  ('Please use only the figures in the Overview document so every group cites the same numbers.',                   'Policy Director',  'policy@advocacygroup.example',        '3 days'),
  ('Can we get Spanish and Vietnamese versions? Many neighbors read those first.',                                  'Program Director', 'programs@communityorg.example',       '1 day')
) AS v(content, name, email, ago);

-- Getting Started (space 42)
WITH t AS (
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id, created_at, updated_at)
  VALUES (42, 'Which shared services should we formalize first?', 2, now() - interval '5 days', now() - interval '2 days')
  RETURNING id
)
INSERT INTO workshop_messages (thread_id, content, created_by_user_id, display_name, display_email, created_at)
SELECT t.id, v.content, NULL, v.name, v.email, now() - v.ago::interval
FROM t, (VALUES
  ('Bookkeeping is the most common request in the Work Pool. I would start there.',                        'Finance Lead',     'finance@democompany.example',  '5 days'),
  ('Grant writing next. The case study in the Library shows the shared structure already works.',          'Program Director', 'programs@democompany.example', '4 days'),
  ('Agreed. I will draft a one-page description of each service so members know what to expect.',         'Operations Lead',  'operations@democompany.example','2 days')
) AS v(content, name, email, ago);

-- ── Actions (proposals) ─────────────────────────────────────────────────────
INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status, created_at, updated_at)
VALUES
  (43, 'Hold a community practice session before the hearing',
       E'- Host in a congregation hall the week before the hearing\n- Practice oral statements with residents\n- Cover transportation through the mutual aid network', 4, 'under_review', now() - interval '3 days', now() - interval '3 days'),
  (43, 'Publish one shared fact sheet',
       E'- One page, one set of figures\n- Reviewed by the policy and legal members\n- Available in English, Spanish, and Vietnamese', 2, 'submitted', now() - interval '1 day', now() - interval '1 day'),
  (42, 'Draft a shared-services menu',
       E'- One page per service: bookkeeping, grant writing, 990 preparation\n- Who provides it, expected hours, how to ask', 4, 'submitted', now() - interval '2 days', now() - interval '2 days');

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status, decision_notes_markdown, decided_at, decided_by_user_id, created_at, updated_at)
VALUES
  (42, 'Adopt a monthly member call',
       E'- First Thursday of each month\n- Agenda posted 48 hours ahead\n- Notes shared within a week', 2, 'promoted', 'Accepted by consensus. Running since the last quarter.', now() - interval '20 days', 2, now() - interval '30 days', now() - interval '20 days');

-- ── Work Pool ───────────────────────────────────────────────────────────────
INSERT INTO cooperative_work_requests (org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at)
SELECT c.id, v.category::cooperative_work_category, v.title, v.description, v.hours, current_date + v.due, v.status::cooperative_work_status, now() - v.ago::interval, now() - v.ago::interval
FROM (VALUES
  ('demo-legalclinic',       '990_prep',           'Review our 990 before filing',          'A second set of eyes on Schedule A and the compensation section before we file.', 6.0,  21, 'open',        '5 days'),
  ('demo-fisheriescoop',     'grant_writing',      'Foundation renewal narrative',          'Help shaping the statement of need and budget narrative for a renewal due next month.', 10.0, 30, 'open',        '3 days'),
  ('demo-mutualaidnetwork',  'bookkeeping',        'Code storm-relief donations',           'Clean up how donations from the last storm season were coded in our books.',       4.0,  14, 'open',        '2 days'),
  ('demo-youthclimategroup', 'board_reporting',    'First board report template',           'We are a new board and need a simple quarterly report format.',                    3.0,  28, 'open',        '1 day'),
  ('demo-communityorg',      'financial_analysis', 'Cost per family served',                'Work out the program cost per family served across our three programs.',           5.0,  35, 'open',        '6 days'),
  ('demo-faithcoalition',    'bookkeeping',        'Monthly reconciliation support',        'Someone to walk our treasurer through the monthly bank reconciliation.',           4.0,  10, 'in_progress', '12 days')
) AS v(slug, category, title, description, hours, due, status, ago)
JOIN coop_members c ON c.slug = v.slug;

INSERT INTO cooperative_work_requests (org_id, category, title, description, hours_estimate, needed_by, status, created_at, updated_at)
VALUES (42, 'grant_writing', 'Proposal structure for a foundation deadline', 'Grant-writing support ahead of a foundation deadline. Picked up by a pool volunteer.', 8.0, current_date - 20, 'completed', now() - interval '40 days', now() - interval '25 days');

-- ── Library (work library items) ────────────────────────────────────────────
UPDATE cooperative_work_library_items SET body_markdown =
E'# Grant Writing Support: Case Study\n\n- FisheriesCoop posted a grant-writing need ahead of a foundation deadline\n- A pool volunteer with grant-writing experience picked it up\n- The proposal structure (statement of need, project description, budget narrative) was reused by CommunityOrg and LegalClinic that quarter'
 WHERE id = 3;
UPDATE cooperative_work_library_items SET body_markdown =
E'# Q3 Governance Review: Member Meeting Notes\n\n- Reviewed proposed updates to member voting thresholds\n- Reviewed the current committee structure\n- No binding decisions this session\n- Follow-up proposal to be drafted for the next meeting'
 WHERE id = 4;
UPDATE cooperative_work_library_items SET body_markdown =
E'# Communication Channels\n\n- **Slack:** #general, #grants-and-funding, #policy-watch, #bookkeeping-help\n- **Invites:** sent to each member org''s primary contact on activation\n- **Monthly member call:** first Thursday of the month\n- **Agenda:** posted in #general 48 hours ahead; notes posted within a week'
 WHERE id = 5;
UPDATE cooperative_work_library_items w SET body_markdown = d.content
  FROM workshop_documents d
 WHERE d.workspace_id = 42 AND w.workshop_id = (SELECT project_id FROM workshop_workspaces WHERE id = 42)
   AND w.title = d.title;
