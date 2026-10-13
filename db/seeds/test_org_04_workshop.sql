-- Tidal Shift section 4: Workshop. Its own "Getting Started" workspace (same shape as the starter every org gets) and a
-- coalition legal-strategy space on the CP2 LNG permit. Facts used (DOE docket FE 26-78-LNG, Cameron Parish, comment deadline
-- 2026-10-02) are only those already in migration 132. Participants other than the two real logins are role labels, no names.
-- Re-runnable: removes its two projects first. Does not touch the existing CP2 coalition (project 9).

DO $seed$
DECLARE
  v_org int; v_guy int; v_fin int; pid int; ws int; th int;
BEGIN
  SELECT id INTO v_org FROM coop_members WHERE slug = 'tidal-shift';
  IF v_org IS NULL THEN RAISE EXCEPTION 'run section 1 first'; END IF;
  SELECT id INTO v_guy FROM users WHERE email = 'guy@causal.works';
  SELECT id INTO v_fin FROM users WHERE email = 'gyacc@pm.me';

  DELETE FROM workshop_projects WHERE slug IN ('getting-started-' || v_org, 'tidal-shift-cp2-legal-strategy');

  -- ---- Getting Started (org internal)
  INSERT INTO workshop_projects (slug, name, description, phase)
    VALUES ('getting-started-' || v_org, 'Getting Started',
      'The first decisions and habits Tidal Shift needs in place: how decisions get made, how members are onboarded, and how the team stays in touch.', 'research')
    RETURNING id INTO pid;
  INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, access_scope)
    VALUES (pid, 'main', 'Getting Started', 'Internal decisions and habits for the team.', 'org_internal', 'members_only') RETURNING id INTO ws;
  INSERT INTO workshop_space_members (space_id, user_id, org_id, role) VALUES (ws, v_guy, v_org, 'convener'), (ws, v_fin, v_org, 'participant');
  INSERT INTO workshop_documents (workspace_id, title, content, created_by_user_id, updated_by_user_id, doc_type) VALUES
    (ws, 'What This Workshop Is For', E'- One place for decisions that need more than one person\n- Start a **thread** for a question\n- Write a **proposal** when you''re ready to decide\n- Keep **notes** so the reasoning is findable later\n- Invite colleagues from Settings > Workspace users', v_guy, v_guy, 'note'),
    (ws, 'First Workstreams', E'- **Decision-making:** who decides what\n- **Onboarding:** a short checklist for new people\n- **Communication:** where you talk, and how often\n- **Shared resources:** what you could share with other cooperatives', v_guy, v_guy, 'note');
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id) VALUES
    (ws, 'How should we make decisions?', v_guy), (ws, 'What belongs on the onboarding checklist?', v_guy);

  -- ---- CP2 legal strategy (coalition, visible to cooperative members)
  INSERT INTO workshop_projects (slug, name, description, phase, e4a_turnarounds)
    VALUES ('tidal-shift-cp2-legal-strategy', 'CP2 LNG Expansion — Legal Strategy',
      'Legal and technical coordination after the DOE comment period on the CP2 LNG Terminal expansion (Cameron Parish, Louisiana): protecting the administrative record and preparing for possible judicial review.',
      'implementation', ARRAY['energy'])
    RETURNING id INTO pid;
  INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, access_scope, e4a_turnarounds)
    VALUES (pid, 'legal-strategy', 'CP2 Legal Strategy',
      'Counsel and technical advisors coordinating how comments, expert evidence and the record are organized for a possible court challenge.', 'coalition', 'cooperative_visible', ARRAY['energy'])
    RETURNING id INTO ws;
  INSERT INTO workshop_space_members (space_id, user_id, org_id, role, display_name) VALUES
    (ws, v_guy, v_org, 'convener', NULL), (ws, v_fin, v_org, 'participant', NULL);
  INSERT INTO workshop_space_members (space_id, role, display_name) VALUES
    (ws, 'participant', 'Staff Attorney'), (ws, 'participant', 'Atmospheric Science Advisor'), (ws, 'participant', 'Community Organizer'),
    (ws, 'participant', 'Policy Director'), (ws, 'observer', 'Board Chair');
  INSERT INTO workshop_documents (workspace_id, title, content, created_by_user_id, updated_by_user_id, doc_type) VALUES
    (ws, 'Overview', E'# Overview\n\nDOE accepted public comments on Venture Global''s application (FE Docket No. 26-78-LNG) for the CP2 LNG Terminal expansion until **October 2, 2026**.\n\nThe comment period is closed. This space is for what happens next: making sure the record shows what commenters raised, lining up expert evidence, and deciding what a court challenge would need.', v_guy, v_guy, 'note'),
    (ws, 'Record Preservation Checklist', E'- Confirm every coalition comment is filed in the docket and saved with its confirmation\n- Collect exhibits and cite each one in the comment that attached it\n- List issues raised by commenters so none are lost\n- Note any deadline for requesting rehearing once a decision issues\n- Keep one shared folder; assign one person to own it', v_guy, v_guy, 'note'),
    (ws, 'Open Questions for Counsel', E'- Which issues were raised clearly enough to preserve?\n- Does the coalition need a second expert on air quality modeling?\n- Who can be a named party, and who prefers to support as an amicus?', v_guy, v_guy, 'note');
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id) VALUES (ws, 'Did our comments preserve the air quality issues?', v_guy) RETURNING id INTO th;
  INSERT INTO workshop_messages (thread_id, content, created_by_user_id, display_name) VALUES
    (th, 'I read the filed comments against the issue list. Air quality modeling is covered; the cumulative-impacts point is only in one of them.', NULL, 'Staff Attorney'),
    (th, 'If the cumulative-impacts point matters for a challenge, we should confirm it is clear enough in the record. Can we file a short supplement?', NULL, 'Policy Director'),
    (th, 'I can draft a two-page technical supplement if counsel tells me the question to answer.', NULL, 'Atmospheric Science Advisor');
  INSERT INTO workshop_threads (workspace_id, title, created_by_user_id) VALUES (ws, 'Who joins as a named party?', v_guy) RETURNING id INTO th;
  INSERT INTO workshop_messages (thread_id, content, created_by_user_id, display_name) VALUES
    (th, 'Residents in the parish want to be named but worry about retaliation from employers. We should talk to them one at a time.', NULL, 'Community Organizer');
  INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status) VALUES
    (ws, 'Retain an atmospheric scientist for the record', E'- Scope: review the emissions modeling in the application\n- Deliverable: a short report counsel can cite\n- Funding: litigation fund, no new grant needed', v_guy, 'under_review'),
    (ws, 'File a supplemental technical statement', E'- Two pages, limited to the cumulative-impacts question\n- Filed jointly by the coalition members that commented\n- Draft circulated to all members first', v_guy, 'submitted'),
    (ws, 'Ask for a public hearing in the parish', E'- Request in writing to DOE\n- Offer a venue and interpretation\n- Residents can testify in person', v_fin, 'declined'),
    (ws, 'Invite partner organizations to join as amici', E'- Draft a one-page description of the case for each partner\n- Decide a deadline for commitments', v_guy, 'draft');
  UPDATE workshop_proposals SET decision_notes_markdown = 'DOE has not scheduled hearings for this docket; the coalition agreed to put effort into the record instead.', decided_at = TIMESTAMPTZ '2026-10-03 15:00+00', decided_by_user_id = v_guy
    WHERE space_id = ws AND status = 'declined';
END
$seed$;
