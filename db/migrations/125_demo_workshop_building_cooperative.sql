-- 125: Demo workshop "Building the Cooperative" for demo-company.
--
-- The only workshop seeded anywhere (migration 120, "Global Just Transition Fund")
-- is a systems-modeling coalition example scoped to test-co. demo-company's Workshop
-- tab shows "No workshop projects yet." This adds a real, coordination-flavored first
-- workshop for demo-company: the actual work of building the cooperative itself beyond
-- what the platform sets an org up to do automatically (governance, shared services,
-- onboarding, communication infrastructure) — not a systems/causal-loop exercise.

INSERT INTO workshop_projects (slug, name, description, phase)
VALUES (
  'building-the-cooperative',
  'Building the Cooperative',
  'Coordinating the work of growing the cooperative into more than what the platform sets member orgs up to do automatically — governance, shared services, onboarding, and communication infrastructure.',
  'implementation'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO workshop_workspaces (project_id, slug, name, description)
SELECT p.id,
       'coop-foundations',
       'Cooperative Foundations',
       'Demo Company, Org 1, Org 2, and Org 3 coordinating the cooperative''s own governance, shared services, onboarding, and communication infrastructure.'
FROM workshop_projects p
WHERE p.slug = 'building-the-cooperative'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_workspaces w WHERE w.project_id = p.id AND w.slug = 'coop-foundations'
  );

INSERT INTO workshop_documents (workspace_id, title, content)
SELECT w.id,
       'What This Workshop Coordinates',
       $md$# What This Workshop Coordinates

**Purpose:** the platform sets every new org up with budget, grants, compliance, and reporting tools on day one — but it doesn't decide how the cooperative itself is governed, what services member orgs share, how a new member gets oriented beyond the automated setup, or how members actually stay in touch. That's what this workshop is for.

**Participants:** Demo Company (piloting this workspace), Org 1, Org 2, and Org 3 — the cooperative's current member orgs.

**Current state:** the cooperative is in early formation. Every member org has the platform's default tools (budget, grants, compliance, work pool, engagement, library), but the cooperative-level structures around them — a governance process, a shared-services roadmap, an onboarding path, a communication rhythm — are still being built rather than fixed. This workspace is where that build-out happens, in the open, with the members doing it.$md$
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'What This Workshop Coordinates'
  );

INSERT INTO workshop_documents (workspace_id, title, content)
SELECT w.id,
       'What This Replaces',
       $md$# What This Replaces

Without a shared workspace, coordinating four member orgs on cooperative-level decisions would mean:

- A scattered email thread every time a governance question comes up, with no record of who actually agreed to what.
- Ad-hoc DMs between whichever org staff happen to know each other, so newer members miss context the founding members already have.
- A Google Doc (or three, forked and never reconciled) for anything that needs written input from more than one org.
- Re-explaining the same onboarding steps to each new member org individually, because there's no single place that has them written down.

This workspace isn't a discussion nice-to-have — it's the difference between the cooperative's foundational decisions living somewhere everyone can find them, versus living in whoever's inbox happened to be on the thread.$md$
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'What This Replaces'
  );

INSERT INTO workshop_documents (workspace_id, title, content)
SELECT w.id,
       'Current Workstreams & Next Steps',
       $md$# Current Workstreams & Next Steps

**Governance & decision rights.** Drafting how cooperative-level decisions actually get made — who has a vote, what needs unanimous member sign-off versus a simple majority, and how a new member org gets seated. Not yet formalized; this is the first thing on the list because everything else depends on it.

**Shared-services roadmap.** The Work Pool already lets one org post a need (bookkeeping, grant writing, 990 prep) for another to pick up — this workstream is figuring out which of those services are common enough across members to formalize into an actual shared resource (a shared bookkeeper, a shared grant-writing rotation) instead of one-off posts.

**Member onboarding beyond platform defaults.** The platform gets a new org's budget and compliance tools running on day one, but doesn't teach them how the cooperative works — who to ask what, which shared resources exist, what's expected of a member. Drafting a real onboarding checklist so the next member org (after Org 1/2/3) isn't figuring it out from scratch.

**Communication infrastructure.** The Slack workspace and monthly member call are running (see the Engagement tab), but the channel structure and meeting cadence were set up provisionally at launch — this workstream is reviewing whether they're actually the right shape now that there's real usage to look at.$md$
FROM workshop_workspaces w
JOIN workshop_projects p ON p.id = w.project_id
WHERE p.slug = 'building-the-cooperative' AND w.slug = 'coop-foundations'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_documents d WHERE d.workspace_id = w.id AND d.title = 'Current Workstreams & Next Steps'
  );

-- ── Link into demo-company's Cooperative work library (also gates Workshop-tab visibility) ──

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'What This Workshop Coordinates',
       'Purpose, participants, and current state of the Building the Cooperative workshop.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'building-the-cooperative' AND d.title = 'What This Workshop Coordinates'),
       p.id,
       o.id,
       3
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'building-the-cooperative' AND o.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'What This Workshop Coordinates');

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'What This Replaces',
       'Why this workspace exists instead of scattered email/DM/doc coordination between member orgs.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'building-the-cooperative' AND d.title = 'What This Replaces'),
       p.id,
       o.id,
       4
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'building-the-cooperative' AND o.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'What This Replaces');

INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, workshop_id, source_coop_org_id, display_order)
SELECT 'workshop_output',
       'Current Workstreams & Next Steps',
       'Active work: governance, shared services, member onboarding, and communication infrastructure.',
       (SELECT content FROM workshop_documents d JOIN workshop_workspaces w ON w.id = d.workspace_id JOIN workshop_projects p ON p.id = w.project_id WHERE p.slug = 'building-the-cooperative' AND d.title = 'Current Workstreams & Next Steps'),
       p.id,
       o.id,
       5
FROM workshop_projects p, coop_orgs o
WHERE p.slug = 'building-the-cooperative' AND o.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Current Workstreams & Next Steps');
