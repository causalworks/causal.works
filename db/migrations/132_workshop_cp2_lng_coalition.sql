-- 132: Second demo workshop, anchored to a real EIP Oil & Gas Watch alert
-- (actions.id=467, eip_alert_id='ca88a124-f9e9-4066-8e96-4875296666ca'): DOE's
-- open comment period on Venture Global's CP2 LNG Terminal expansion permit
-- (Cameron Parish, Louisiana), closing 2026-10-02. The facility/timeline facts
-- below are real (pulled from the live actions table); the coalition roster,
-- proposals, and discussion are an authored fictional scenario built around
-- them, following the same static one-time-seed pattern as migrations 120/125
-- (not live-linked via workshop_civic_links, per plan decision for demo
-- stability).

INSERT INTO workshop_projects (slug, name, description, phase, e4a_turnarounds)
VALUES (
  'stop-cp2-lng-expansion',
  'CP2 LNG Terminal Expansion — Coalition Response',
  'A coalition responding to DOE''s open comment period on Venture Global''s proposed expansion of the CP2 LNG Terminal in Cameron Parish, Louisiana — a permit that would add 11.7 million metric tons/year of LNG export capacity. Comments close October 2, 2026.',
  'implementation',
  ARRAY['energy']
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, access_scope)
SELECT p.id,
       'coalition-response',
       'CP2 Coalition Response',
       'Gulf Coast community groups and regional allies coordinating a public comment campaign ahead of DOE''s October 2, 2026 deadline on the CP2 LNG Terminal expansion.',
       'coalition',
       'cooperative_visible'
FROM workshop_projects p
WHERE p.slug = 'stop-cp2-lng-expansion'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_workspaces w WHERE w.project_id = p.id AND w.slug = 'coalition-response'
  );

-- ── Documents ──

INSERT INTO workshop_documents (workspace_id, title, content, doc_type)
SELECT w.id,
       'Overview',
       $md$# Overview

**What's happening:** On August 3, 2026, the U.S. Department of Energy announced it is accepting public comments on Venture Global's application (FE Docket No. 26-78-LNG) for a permit to export liquefied natural gas from a proposed expansion of its CP2 LNG Terminal in Cameron Parish, Louisiana. If approved, the permit would allow the company to export an additional 11.7 million metric tons of LNG per year — roughly 620.5 billion cubic feet of natural gas — from the terminal.

**Deadline:** DOE is accepting comments on the application until **October 2, 2026**.

**Source:** [Federal Register notice, via EIP Oil & Gas Watch](https://oilandgaswatch.org/alert/ca88a124-f9e9-4066-8e96-4875296666ca)

**Why a coalition formed:** Cameron Parish sits in one of the most LNG-dense stretches of the Gulf Coast, and this expansion is the kind of decision that gets made in a comment docket most residents never hear about — until the terminal is operating. Gulf Coast community groups, regional climate organizations, and a fisheries-dependent local economy have a shared interest in getting a coordinated, well-informed set of comments into the docket before the window closes, rather than a scattering of individual submissions.$md$,
       'note'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Overview'
  );

INSERT INTO workshop_documents (workspace_id, title, content, doc_type, e4a_turnarounds)
SELECT w.id,
       'Why This Matters — Systems View',
       $md$# Why This Matters — Systems View

**Reinforcing loop: permit approval locks in decades of operation.** LNG export terminals are built for a 20-40 year operating life once a permit is granted — the capital investment only pencils out at that timescale. Each additional terminal approved makes the next one easier to justify (existing pipeline and shipping infrastructure, established regulatory precedent, sunk political capital in the export strategy), which increases the odds the next expansion also gets approved. Meanwhile, gas committed to a 30-year export contract is gas that can't be phased out on a 10-15 year decarbonization timeline — the permit doesn't just add emissions, it removes flexibility to reduce them later.

**Leverage point: the comment period is the narrowest point in the loop.** Once DOE issues the permit, there is no equivalent public-input moment until the terminal is already operating and facing renewal decades later. A comment period is the one place where public pressure can still change the outcome before the lock-in happens — which is why a coordinated, well-documented set of comments (rather than a handful of individual ones) has outsized leverage relative to the effort required to produce them.$md$,
       'systems_map_loop',
       ARRAY['energy']
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Why This Matters — Systems View'
  );

INSERT INTO workshop_documents (workspace_id, title, content, doc_type, e4a_turnarounds)
SELECT w.id,
       'Cross-Turnaround Cascade',
       $md$### Energy

This is the primary turnaround at stake: an additional 620.5 billion cubic feet/year of gas export capacity extends fossil fuel infrastructure lock-in by decades at exactly the point the energy system needs to be phasing gas out, not building new export capacity for it.

### Inequality

Cameron Parish is a low-income, rural parish already hosting a dense cluster of LNG terminals. Local residents absorb the industrial buildout, truck traffic, and flaring risk while the exported gas serves markets overseas — a pattern where the burden of new fossil infrastructure concentrates in communities with the least capacity to contest it individually, which is part of why a coordinated coalition comment campaign matters more here than in a wealthier, better-resourced area.

### Poverty

The parish's fishing and shrimping economy depends on estuary and coastal water quality that industrial LNG buildout puts at risk — an expansion that threatens a local livelihood base without a credible transition plan for the workers and families who depend on it.$md$,
       'systems_map_cascade',
       ARRAY['energy', 'inequality', 'poverty']
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Cross-Turnaround Cascade'
  );

-- ── Participants (fictional coalition roster, using existing demo users as proxies) ──

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 2, o.id, 'convener'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-company'
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 3, o.id, 'participant'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-1'
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 4, o.id, 'participant'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-2'
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
ON CONFLICT (space_id, user_id) DO NOTHING;

INSERT INTO workshop_space_members (space_id, user_id, coop_org_id, role)
SELECT w.id, 14, o.id, 'observer'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
JOIN coop_orgs o ON o.slug = 'demo-org-3'
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
ON CONFLICT (space_id, user_id) DO NOTHING;

-- ── Proposals ──

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status, decision_notes_markdown, decided_at, decided_by_user_id)
SELECT w.id,
       'Submit a joint public comment opposing the CP2 expansion',
       $md$Draft and submit a single, well-documented joint comment to DOE's docket (FE Docket No. 26-78-LNG) ahead of the October 2, 2026 deadline, covering climate impact, cumulative local air/water burden in Cameron Parish, and the fishing-economy risk — signed by the coalition's member organizations rather than filed as separate individual comments.$md$,
       2,
       'promoted',
       'Approved by all coalition members. Draft comment to circulate for review by September 15, with submission the week of September 22 to leave buffer before the deadline.',
       now() - interval '4 days',
       2
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_proposals pr WHERE pr.space_id = w.id AND pr.title = 'Submit a joint public comment opposing the CP2 expansion'
  );

INSERT INTO workshop_proposals (space_id, title, body_markdown, proposed_by_user_id, status)
SELECT w.id,
       'Recruit local Cameron Parish voices for the comment record',
       $md$DOE weighs comments from directly affected residents differently than out-of-parish organizational comments. Propose reaching out to the shrimping/fishing community and any existing Cameron Parish residents' groups to submit their own comments (with coalition support drafting them) alongside the joint organizational comment.$md$,
       3,
       'under_review'
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_proposals pr WHERE pr.space_id = w.id AND pr.title = 'Recruit local Cameron Parish voices for the comment record'
  );

-- ── Discussion ──

INSERT INTO workshop_threads (workspace_id, title, created_by_user_id)
SELECT w.id, 'What should the joint comment lead with?', 2
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_threads t WHERE t.workspace_id = w.id AND t.title = 'What should the joint comment lead with?'
  );

INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
SELECT t.id,
       $md$I'd lead with the cumulative-impact point — Cameron Parish already hosts multiple LNG terminals, and DOE's review doesn't seem to weigh that existing burden. That's a harder point for them to wave off than a general climate objection.$md$,
       2
FROM workshop_threads t
JOIN workshop_workspaces w ON w.id = t.workspace_id
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND t.title = 'What should the joint comment lead with?'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_messages m WHERE m.thread_id = t.id AND m.created_by_user_id = 2
  );

INSERT INTO workshop_messages (thread_id, content, created_by_user_id)
SELECT t.id,
       $md$Agreed, and I think we should pair it with the fishing-economy angle specifically — it's concrete and local in a way "climate impact" alone isn't for a comment docket. Cumulative burden opens it, economic/livelihood risk backs it up.$md$,
       3
FROM workshop_threads t
JOIN workshop_workspaces w ON w.id = t.workspace_id
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'stop-cp2-lng-expansion' AND w.slug = 'coalition-response'
  AND t.title = 'What should the joint comment lead with?'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_messages m WHERE m.thread_id = t.id AND m.created_by_user_id = 3
  );

-- ── Link into demo-company's Cooperative work library (gates Workshop-tab visibility) ──

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'CP2 LNG Terminal Expansion — Coalition Response',
       'Coalition coordinating a joint public comment ahead of DOE''s October 2, 2026 deadline on the CP2 LNG Terminal expansion permit.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'stop-cp2-lng-expansion' AND d.title = 'Overview'),
       p.id,
       o.id,
       6
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'stop-cp2-lng-expansion' AND o.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'CP2 LNG Terminal Expansion — Coalition Response');
