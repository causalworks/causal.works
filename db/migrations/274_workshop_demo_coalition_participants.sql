-- 274: make the demo workshops read as a coalition. Adds display-only participants (no user
-- account behind them) to Getting Started (space 42) and the CP2 coalition (space 43), the same
-- group in both. Roles only, no invented org or person names (see 272); addresses use the
-- reserved .example domain (see 273).
--
-- workshop_space_members.user_id becomes nullable so a participant can be a display-only seat.
-- Membership checks match on user_id, so these rows grant nobody access to anything.

ALTER TABLE workshop_space_members ALTER COLUMN user_id DROP NOT NULL;

INSERT INTO workshop_space_members (space_id, user_id, org_id, role, display_name, display_email)
SELECT s.id, NULL, NULL, v.role::workshop_space_role, v.display_name, v.display_email
FROM (VALUES (42), (43)) AS s(id)
CROSS JOIN (VALUES
  ('participant', 'Program Director',      'programs@democoop.example'),
  ('participant', 'Finance Lead',          'finance@democoop.example'),
  ('participant', 'Policy Director',       'policy@democoop.example'),
  ('participant', 'Community Organizer',   'organizing@democoop.example'),
  ('participant', 'Communications Lead',   'communications@democoop.example'),
  ('participant', 'Development Director',  'development@democoop.example'),
  ('observer',    'Board Chair',           'board@democoop.example')
) AS v(role, display_name, display_email)
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_space_members m WHERE m.space_id = s.id AND m.display_name = v.display_name
);
