-- Congress leaders (Speaker, Majority/Minority Leader) often hold few or no standing
-- committee seats by design, so committee->turnaround mapping alone under-tags them.
-- legislators-current.json already carries a leadership_roles history we weren't using.
ALTER TABLE representatives ADD COLUMN IF NOT EXISTS leadership_role TEXT;
