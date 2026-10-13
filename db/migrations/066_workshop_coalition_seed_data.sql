-- 066: Seed data for Workshop coalition function build-out (W1.3)

-- Insert new coalition spaces into existing project
-- Note: This is a simplified seed - just the spaces themselves.
-- Full seed data (members, proposals, documents, civic links) can be added via API once implemented.

INSERT INTO workshop_workspaces (project_id, slug, name, description, space_type, e4a_turnarounds, access_scope)
SELECT 
  p.id, 
  x.slug, 
  x.name, 
  x.description,
  x.space_type::workshop_space_type,
  x.e4a_turnarounds,
  x.access_scope::workshop_access_scope
FROM (SELECT id FROM workshop_projects WHERE slug = 'personal-balance-sheet' LIMIT 1) p
CROSS JOIN (
  VALUES
    ('climate-coalition', 'Climate Utility Commission Coalition', 'Cross-organization coalition working on state-level utility commission campaigns for renewable energy transition.', 'coalition', ARRAY['energy', 'poverty'], 'cooperative_visible'),
    ('housing-coalition', 'Housing Rights Coalition', 'Coalition of organizations working on tenant protections and affordable housing policy.', 'coalition', ARRAY['inequality', 'poverty'], 'cooperative_visible'),
    ('cooperative-governance', 'Cooperative Governance', 'Space for cooperative governance discussions, bylaws development, and decision-making.', 'cooperative_governance', ARRAY[]::TEXT[], 'members_only'),
    ('cooperative-methods', 'Cooperative Methods', 'Space for developing and revising shared cooperative methods, templates, and guidance.', 'cooperative_methods', ARRAY[]::TEXT[], 'cooperative_visible')
) AS x(slug, name, description, space_type, e4a_turnarounds, access_scope)
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_workspaces ww 
  WHERE ww.project_id = p.id AND ww.slug = x.slug
);
