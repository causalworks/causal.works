-- Country + postal code for reps and org hints (replaces freeform location + street_address).
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_country VARCHAR(2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS location_zip VARCHAR(20);

-- Best-effort: old freeform text becomes postal field (users may re-enter).
UPDATE users SET location_zip = location WHERE location IS NOT NULL AND (location_zip IS NULL OR location_zip = '');

ALTER TABLE users DROP COLUMN IF EXISTS location;
ALTER TABLE users DROP COLUMN IF EXISTS street_address;
