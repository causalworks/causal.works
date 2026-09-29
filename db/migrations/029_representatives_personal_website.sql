-- Optional second URL (e.g. Bundestag biography for German MdBs).
ALTER TABLE representatives ADD COLUMN IF NOT EXISTS personal_website TEXT;
