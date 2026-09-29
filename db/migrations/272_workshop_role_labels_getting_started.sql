-- 272: naming convention for seeded workshop participants + common name for the baseline workshop.
--
-- Convention (matches the CP2 coalition workshop): example participants are labelled by ROLE
-- only ("Governance Lead", "Coalition Convener"), never by an invented organization or person
-- name, because an invented name can collide with a real one. Where a participant is a real
-- member of the instance, workshop_space_members.org_id carries the org attribution. This undoes
-- migration 271's fictional org names.
--
-- The baseline workshop is called "Getting Started" in every instance (same name the
-- server/organizational/lib/starterWorkshop.js template gives new orgs). Demo Company's populated
-- copy was "Building the Cooperative".
-- Also removes the founder's "What is causal.works?" research workshop from the demo instance.

-- Participant labels: role only.
UPDATE workshop_space_members SET display_name = 'Governance Lead'  WHERE display_name = 'Demo Company — Governance Lead';
UPDATE workshop_space_members SET display_name = 'Operations Lead'  WHERE display_name LIKE '% — Operations Lead';
UPDATE workshop_messages SET display_name = 'Governance Lead'  WHERE display_name = 'Demo Company — Governance Lead';
UPDATE workshop_messages SET display_name = 'Program Director' WHERE display_name LIKE '% — Program Director';
UPDATE workshop_messages SET display_name = 'Finance Lead'     WHERE display_name LIKE '% — Finance Lead';
UPDATE workshop_messages SET display_name = 'Operations Lead'  WHERE display_name LIKE '% — Operations Lead';

-- Text references to the other member orgs: describe by role, not by name.
UPDATE workshop_documents
   SET content = replace(replace(content,
        'Demo Company (piloting this workspace), River Valley Food Pantry, Harbor Arts Collective, and Northside Tenant Union — the cooperative''s current member orgs',
        'Demo Company (piloting this workspace) and the cooperative''s other member orgs, each represented here by a role (Governance Lead, Operations Lead, Finance Lead, Program Director)'),
        '(after River Valley, Harbor Arts, and Northside)',
        '(after the current members)')
 WHERE content ~ 'River Valley|Harbor Arts|Northside';

-- Common name.
UPDATE workshop_projects
   SET name = 'Getting Started', slug = 'getting-started-42'
 WHERE slug = 'building-the-cooperative';
UPDATE workshop_workspaces SET name = 'Getting Started'
 WHERE project_id = (SELECT id FROM workshop_projects WHERE slug = 'getting-started-42');

-- Founder's research workshop (cascades to its workspace and content).
DELETE FROM workshop_projects WHERE slug = 'what-is-causal-works-msuf0ng2';
