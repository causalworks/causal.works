-- Personnel: is_officer_or_key (2026-10-04). Marks a person whose pay is shown to board members on Form 990 Schedule J
-- (officers, directors and key employees). Board members never see the rest of personnel; admin and finance see all.
ALTER TABLE org_personnel ADD COLUMN IF NOT EXISTS is_officer_or_key boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN org_personnel.is_officer_or_key IS 'Officer, director or key employee: shown to board members (and only these people) on 990 Schedule J.';
-- demo-company: the Executive Director is the officer shown to the board.
-- (the fiscal-year lock would block editing the locked 2025 rows, so the triggers are paused for this flag-only change)
ALTER TABLE org_personnel DISABLE TRIGGER USER;
UPDATE org_personnel SET is_officer_or_key = true
 WHERE org_id = (SELECT id FROM coop_members WHERE slug = 'demo-company') AND title = 'Executive Director';
ALTER TABLE org_personnel ENABLE TRIGGER USER;
