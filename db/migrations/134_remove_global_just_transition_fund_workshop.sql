-- 134: Remove the "Global Just Transition Fund" demo workshop (migration 120).
-- It models a speculative real-world global initiative Causal has no actual
-- relationship to (see project discussion) — removed in favor of the two
-- workshops built in migrations 132/133 (an authored coalition anchored to a
-- real EIP Oil & Gas Watch alert, and the upgraded "Building the Cooperative").
--
-- workshop_workspaces/documents/proposals/space_members/threads/messages/
-- civic_links all cascade-delete from workshop_projects. cooperative_work_
-- library_items.workshop_id is ON DELETE SET NULL, not cascade, so those rows
-- are deleted explicitly first (they're specific to this workshop, not
-- reusable general-purpose library content).

DELETE FROM cooperative_work_library_items
WHERE workshop_id = (SELECT id FROM workshop_projects WHERE slug = 'global-just-transition-fund');

DELETE FROM workshop_projects WHERE slug = 'global-just-transition-fund';
