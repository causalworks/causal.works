-- 280: workshop participants come only from the Cooperative Members list (the demo fixture orgs).
-- Demo Company was showing as a participant org (and @democompany.example addresses); it is the
-- viewer's own workspace, not a member in the list. Visibility of the two demo workshops to Demo
-- Company does not depend on these seats: it comes through the workshops' library items
-- (source_org_id = Demo Company), see cooperative.js.

-- CP2 coalition (space 43): the convener seat moves to CommunityOrg.
UPDATE workshop_space_members
   SET org_id = (SELECT id FROM coop_members WHERE slug = 'demo-communityorg'),
       display_email = 'convener@communityorg.example'
 WHERE space_id = 43 AND display_name = 'Coalition Convener';
UPDATE workshop_messages SET display_email = 'convener@communityorg.example'
 WHERE thread_id IN (SELECT id FROM workshop_threads WHERE workspace_id = 43) AND display_name = 'Coalition Convener';

-- Getting Started (space 42): cooperative roles spread across the member orgs.
UPDATE workshop_space_members m SET
  org_id = c.id,
  display_email = v.email
FROM (VALUES
  ('Governance Lead',      'demo-communityorg',       'governance@communityorg.example'),
  ('Operations Lead',      'demo-mutualaidnetwork',   'operations@mutualaidnetwork.example'),
  ('Program Director',     'demo-advocacygroup',      'programs@advocacygroup.example'),
  ('Finance Lead',         'demo-fisheriescoop',      'finance@fisheriescoop.example'),
  ('Communications Lead',  'demo-youthclimategroup',  'communications@youthclimategroup.example'),
  ('Development Director', 'demo-legalclinic',        'advisor@legalclinic.example'),
  ('Board Chair',          'demo-faithcoalition',     'board@faithcoalition.example')
) AS v(old_label, slug, email)
JOIN coop_members c ON c.slug = v.slug
WHERE m.space_id = 42 AND m.display_name = v.old_label;
UPDATE workshop_space_members SET display_name = 'Governance Advisor' WHERE space_id = 42 AND display_name = 'Development Director';

UPDATE workshop_messages msg SET display_email = v.email
FROM (VALUES
  ('Governance Lead',  'governance@communityorg.example'),
  ('Operations Lead',  'operations@mutualaidnetwork.example'),
  ('Program Director', 'programs@advocacygroup.example'),
  ('Finance Lead',     'finance@fisheriescoop.example')
) AS v(name, email)
WHERE msg.display_name = v.name
  AND msg.thread_id IN (SELECT id FROM workshop_threads WHERE workspace_id = 42);

-- Nothing in the workshops should reference Demo Company's example domains any more.
UPDATE workshop_space_members SET display_email = replace(display_email, '@democompany.example', '@communityorg.example') WHERE display_email LIKE '%@democompany.example';
UPDATE workshop_messages SET display_email = replace(display_email, '@democompany.example', '@communityorg.example') WHERE display_email LIKE '%@democompany.example';

-- Text: Getting Started participants line.
UPDATE workshop_documents
   SET content = replace(content, 'Demo Company and the cooperative''s other member orgs, each shown by role.', 'The cooperative''s member orgs, each shown by role.')
 WHERE workspace_id = 42;
UPDATE workshop_workspaces
   SET description = replace(description, 'Demo Company and the cooperative''s other member orgs coordinating', 'The cooperative''s member orgs coordinating')
 WHERE id = 42;
UPDATE cooperative_work_library_items w SET body_markdown = d.content
  FROM workshop_documents d
 WHERE d.workspace_id = 42 AND w.title = d.title AND w.workshop_id = (SELECT project_id FROM workshop_workspaces WHERE id = 42);
