-- 273: one participant group across the demo workshops. Getting Started and the CP2 coalition
-- workshop both belong to the same demo cooperative, so they use the same roles and the same
-- example addresses (role@democoop.example; .example is reserved and can never be a real address).
-- Roles only, no invented org or person names (see 272).

UPDATE workshop_workspaces
   SET description = 'Demo Company and the cooperative''s other member orgs coordinating the cooperative''s own governance, shared services, onboarding, and communication infrastructure.'
 WHERE id = 42;

-- Getting Started (space 42)
UPDATE workshop_space_members SET display_name = 'Governance Lead', display_email = 'governance@democoop.example' WHERE space_id = 42 AND user_id = 2;
UPDATE workshop_space_members SET display_name = 'Operations Lead', display_email = 'operations@democoop.example' WHERE space_id = 42 AND user_id = 4;
-- CP2 coalition (space 43): same people, same roles
UPDATE workshop_space_members SET display_name = 'Governance Lead', display_email = 'governance@democoop.example' WHERE space_id = 43 AND user_id = 2;
UPDATE workshop_space_members SET display_name = 'Operations Lead', display_email = 'operations@democoop.example' WHERE space_id = 43 AND user_id = 4;

UPDATE workshop_messages SET display_name = 'Governance Lead', display_email = 'governance@democoop.example' WHERE display_name IN ('Governance Lead', 'Coalition Convener');
UPDATE workshop_messages SET display_name = 'Program Director', display_email = 'programs@democoop.example' WHERE display_name IN ('Program Director', 'Community Organizer');
UPDATE workshop_messages SET display_name = 'Finance Lead', display_email = 'finance@democoop.example' WHERE display_name = 'Finance Lead';
