-- 271: make "Building the Cooperative" Demo Company's own workshop instead of a platform-wide
-- starter shown to every org. It was seeded as one specific cooperative (Demo Company plus
-- "Org 1/2/3" placeholders), so every new org saw someone else's conversation. New orgs now get
-- their own generic copy at creation (server/organizational/lib/starterWorkshop.js); this project
-- stays visible to Demo Company via its org_id membership (see cooperative.js visibility clause).

UPDATE workshop_projects SET is_starter = false WHERE slug = 'building-the-cooperative';

-- Replace the "Org N" placeholders with fictional US member orgs, so the demo reads as a real
-- cooperative. Longest patterns first.
UPDATE workshop_documents
   SET content = replace(replace(replace(replace(content,
        '(after Org 1/2/3)', '(after River Valley, Harbor Arts, and Northside)'),
        'Org 1', 'River Valley Food Pantry'),
        'Org 2', 'Harbor Arts Collective'),
        'Org 3', 'Northside Tenant Union')
 WHERE content ~ 'Org [123]';

UPDATE workshop_messages
   SET content = replace(replace(replace(content, 'Org 1', 'River Valley Food Pantry'), 'Org 2', 'Harbor Arts Collective'), 'Org 3', 'Northside Tenant Union'),
       display_name = replace(replace(replace(display_name, 'Org 1', 'River Valley Food Pantry'), 'Org 2', 'Harbor Arts Collective'), 'Org 3', 'Northside Tenant Union')
 WHERE content ~ 'Org [123]' OR display_name ~ 'Org [123]';

UPDATE workshop_space_members
   SET display_name = replace(replace(replace(display_name, 'Org 1', 'River Valley Food Pantry'), 'Org 2', 'Harbor Arts Collective'), 'Org 3', 'Northside Tenant Union')
 WHERE display_name ~ 'Org [123]';

UPDATE workshop_workspaces
   SET name = replace(replace(replace(name, 'Org 1', 'River Valley Food Pantry'), 'Org 2', 'Harbor Arts Collective'), 'Org 3', 'Northside Tenant Union'),
       description = replace(replace(replace(description, 'Org 1', 'River Valley Food Pantry'), 'Org 2', 'Harbor Arts Collective'), 'Org 3', 'Northside Tenant Union')
 WHERE name ~ 'Org [123]' OR description ~ 'Org [123]';
