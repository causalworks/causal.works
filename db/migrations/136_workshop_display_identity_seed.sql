-- 136: Populate display_name/display_email (added in 135) for the "Building
-- the Cooperative" and CP2 LNG coalition workshops' seeded members/messages,
-- replacing real personal email addresses with role-based fictional identities.

-- ── Building the Cooperative (coop-foundations) ──

UPDATE workshop_space_members SET display_name = 'Demo Company — Governance Lead', display_email = 'governance@democompany.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coop-foundations') AND user_id = 2;

UPDATE workshop_space_members SET display_name = 'Org 1 — Program Director', display_email = 'programs@org1.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coop-foundations') AND user_id = 14;

UPDATE workshop_space_members SET display_name = 'Org 2 — Finance Lead', display_email = 'finance@org2.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coop-foundations') AND user_id = 3;

UPDATE workshop_space_members SET display_name = 'Org 3 — Operations Lead', display_email = 'ops@org3.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coop-foundations') AND user_id = 4;

UPDATE workshop_messages SET display_name = 'Demo Company — Governance Lead', display_email = 'governance@democompany.example'
WHERE thread_id IN (SELECT t.id FROM workshop_threads t JOIN workshop_workspaces w ON w.id = t.workspace_id WHERE w.slug = 'coop-foundations')
  AND created_by_user_id = 2;

UPDATE workshop_messages SET display_name = 'Org 1 — Program Director', display_email = 'programs@org1.example'
WHERE thread_id IN (SELECT t.id FROM workshop_threads t JOIN workshop_workspaces w ON w.id = t.workspace_id WHERE w.slug = 'coop-foundations')
  AND created_by_user_id = 14;

UPDATE workshop_messages SET display_name = 'Org 2 — Finance Lead', display_email = 'finance@org2.example'
WHERE thread_id IN (SELECT t.id FROM workshop_threads t JOIN workshop_workspaces w ON w.id = t.workspace_id WHERE w.slug = 'coop-foundations')
  AND created_by_user_id = 3;

-- ── CP2 LNG coalition (coalition-response) ──

UPDATE workshop_space_members SET display_name = 'Coalition Convener', display_email = 'convener@cp2coalition.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coalition-response') AND user_id = 2;

UPDATE workshop_space_members SET display_name = 'Community Organizer', display_email = 'organizer@cp2coalition.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coalition-response') AND user_id = 3;

UPDATE workshop_space_members SET display_name = 'Regional Policy Director', display_email = 'policy@cp2coalition.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coalition-response') AND user_id = 4;

UPDATE workshop_space_members SET display_name = 'State Rep Staffer (Observer)', display_email = 'observer@cp2coalition.example'
WHERE space_id = (SELECT id FROM workshop_workspaces WHERE slug = 'coalition-response') AND user_id = 14;

UPDATE workshop_messages SET display_name = 'Coalition Convener', display_email = 'convener@cp2coalition.example'
WHERE thread_id IN (SELECT t.id FROM workshop_threads t JOIN workshop_workspaces w ON w.id = t.workspace_id WHERE w.slug = 'coalition-response')
  AND created_by_user_id = 2;

UPDATE workshop_messages SET display_name = 'Community Organizer', display_email = 'organizer@cp2coalition.example'
WHERE thread_id IN (SELECT t.id FROM workshop_threads t JOIN workshop_workspaces w ON w.id = t.workspace_id WHERE w.slug = 'coalition-response')
  AND created_by_user_id = 3;
