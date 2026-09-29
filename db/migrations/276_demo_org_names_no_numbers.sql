-- 276: drop the numeric suffixes from the demo member org names (275). The type names are
-- distinct enough on their own; still generic, so they cannot match a real organization.

UPDATE coop_members SET
  display_name = regexp_replace(display_name, '[0-9]+$', ''),
  slug = regexp_replace(slug, '[0-9]+$', '')
WHERE is_demo_fixture;

UPDATE workshop_space_members
   SET display_email = regexp_replace(display_email, '(@[a-z]+)[0-9]+(\.example)$', '\1\2')
 WHERE display_email ~ '@[a-z]+[0-9]+\.example$';
UPDATE workshop_messages
   SET display_email = regexp_replace(display_email, '(@[a-z]+)[0-9]+(\.example)$', '\1\2')
 WHERE display_email ~ '@[a-z]+[0-9]+\.example$';
