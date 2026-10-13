-- 031_orgs_donation_url.sql — direct donate links for Give tab + user suggestions
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS donation_url VARCHAR(500);

CREATE TABLE IF NOT EXISTS org_donation_url_suggestions (
    id SERIAL PRIMARY KEY,
    org_id INTEGER NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    suggested_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_org_donation_url_suggestions_org_id
    ON org_donation_url_suggestions(org_id);

UPDATE orgs SET donation_url = 'https://www.aclu.org/donate' WHERE name ILIKE '%aclu%';
UPDATE orgs SET donation_url = 'https://www.sierraclub.org/donate' WHERE name ILIKE '%sierra club%';
UPDATE orgs SET donation_url = 'https://www.nrdc.org/donate' WHERE name ILIKE '%natural resources defense%';
UPDATE orgs SET donation_url = 'https://350.org/donate' WHERE name ILIKE '%350.org%';
UPDATE orgs SET donation_url = 'https://www.avaaz.org/donate' WHERE name ILIKE '%avaaz%';
UPDATE orgs SET donation_url = 'https://eko.org/donate' WHERE name ILIKE '%ekō%' OR name ILIKE '%eko%';
UPDATE orgs SET donation_url = 'https://www.greenpeace.org/usa/donate' WHERE name ILIKE '%greenpeace%';
UPDATE orgs SET donation_url = 'https://www.ucsusa.org/donate' WHERE name ILIKE '%union of concerned%';
UPDATE orgs SET donation_url = 'https://nipnlg.org/donate' WHERE name ILIKE '%national immigration project%';
UPDATE orgs SET donation_url = 'https://www.jfrej.org/donate' WHERE name ILIKE '%jews for racial%';
UPDATE orgs SET donation_url = 'https://www.sunrisemovement.org/donate' WHERE name ILIKE '%sunrise%';
UPDATE orgs SET donation_url = 'https://earthjustice.org/donate' WHERE name ILIKE '%earthjustice%';
