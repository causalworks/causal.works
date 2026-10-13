-- 133: Populate workshop_space_members / workshop_proposals / workshop_threads
-- /workshop_messages for the "Building the Cooperative" workshop (migration 125),
-- which seeded only documents. These tables back the new Participants/Actions/
-- Discussion tabs in the Workshop UI and were empty for this workshop.
--
-- Member/proposal/message authorship reuses existing demo users as stand-ins
-- for the four member orgs (Demo Company, Org 1, Org 2, Org 3) rather than
-- creating new users rows, per plan decision to keep footprint minimal.
--
-- No Systems Map documents are added here — this workshop's own text (125)
-- explicitly frames it as "not a systems/causal-loop exercise," so the
-- Systems Map tab intentionally shows an empty/explanatory state for it.

-- ── Participants ──

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 2, o.id, 'convener'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-company'
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 14, o.id, 'participant'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-1'
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 3, o.id, 'participant'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-2'
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 4, o.id, 'participant'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-3'
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
ON CONFLICT (space_id, user_id) DO NOTHING;

-- ── Proposals (mirrors the workstreams already described in migration 125's
--    "Current Workstreams & Next Steps" document) ──

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status)
SELECT w.id,
       'Adopt governance decision-rights framework',
       $md$Formalize how cooperative-level decisions get made: who has a vote, what needs unanimous member sign-off versus a simple majority, and how a new member org gets seated. This is the first governance question to resolve, since the shared-services and onboarding workstreams both depend on having a working decision process in place.$md$,
       2,
       'under_review'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_proposals pr WHERE pr.space_id = w.id AND pr.title = 'Adopt governance decision-rights framework'
  );

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status)
SELECT w.id,
       'Formalize shared bookkeeping rotation',
       $md$The Work Pool already lets one org post a bookkeeping need for another to pick up one-off. This proposes turning that into a standing shared-services arrangement: a rotating bookkeeper role across member orgs instead of ad-hoc posts each time the need comes up.$md$,
       14,
       'draft'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_proposals pr WHERE pr.space_id = w.id AND pr.title = 'Formalize shared bookkeeping rotation'
  );

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status, decision_notes_markdown, decided_at, decided_by_user_id)
SELECT w.id,
       'Draft member onboarding checklist',
       $md$A written checklist covering what a new member org needs to know beyond the platform's automated setup: who to ask what, which shared resources exist, what's expected of a member. Intended to replace re-explaining the same steps individually to each new org.$md$,
       3,
       'promoted',
       'Approved by all three current member orgs during the monthly member call. First draft to be circulated for review before the next member org joins.',
       now() - interval '9 days',
       2
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_proposals pr WHERE pr.space_id = w.id AND pr.title = 'Draft member onboarding checklist'
  );

-- ── Discussion ──

INSERT INTO workshop_threads (workspace_id, title, created_by_user_id)
SELECT w.id, 'Governance vote threshold — simple majority or unanimous?', 2
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_threads t WHERE t.workspace_id = w.id AND t.title = 'Governance vote threshold — simple majority or unanimous?'
  );

INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
SELECT t.id,
       $md$Proposing unanimous sign-off only for admitting a new member org or changing the shared-services roadmap — everything else (scheduling, minor budget items) can go to simple majority. Otherwise we'll be stuck requiring unanimous consent for things that don't need it.$md$,
       2
FROM workshop_threads t
JOIN workshop_workspaces w ON w.id = t.workspace_id
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND t.title = 'Governance vote threshold — simple majority or unanimous?'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_messages m WHERE m.thread_id = t.id AND m.created_by_user_id = 2
  );

INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
SELECT t.id,
       $md$Agreed on unanimous for new-member admission. For the shared-services roadmap I'd rather that be simple majority too — otherwise one org can block a shared bookkeeper arrangement the other three actually want.$md$,
       14
FROM workshop_threads t
JOIN workshop_workspaces w ON w.id = t.workspace_id
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND t.title = 'Governance vote threshold — simple majority or unanimous?'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_messages m WHERE m.thread_id = t.id AND m.created_by_user_id = 14
  );

INSERT INTO workshop_threads (workspace_id, title, created_by_user_id)
SELECT w.id, 'What belongs on the onboarding checklist?', 3
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_threads t WHERE t.workspace_id = w.id AND t.title = 'What belongs on the onboarding checklist?'
  );

INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
SELECT t.id,
       $md$Beyond the platform walkthrough, I think the checklist needs: who to contact for what (bookkeeping, grant writing, general questions), how the monthly member call works, and what's expected in terms of participation in shared-services rotations once those exist.$md$,
       3
FROM workshop_threads t
JOIN workshop_workspaces w ON w.id = t.workspace_id
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND t.title = 'What belongs on the onboarding checklist?'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_messages m WHERE m.thread_id = t.id AND m.created_by_user_id = 3
  );
