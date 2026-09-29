-- Add contact_form column: Congress members don't publish direct email, but the
-- unitedstates/congress-legislators dataset (server/rep/data/legislators-current.json)
-- carries a per-term contact_form webform URL that already went unused.
ALTER TABLE representatives ADD COLUMN IF NOT EXISTS contact_form TEXT;
