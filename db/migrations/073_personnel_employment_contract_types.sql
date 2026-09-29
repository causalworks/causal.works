-- Add employment_type for employees and contract_type for contractors

ALTER TABLE np_personnel ADD COLUMN employment_type TEXT DEFAULT 'full-time';
ALTER TABLE np_personnel ADD COLUMN contract_type TEXT DEFAULT 'hourly';

-- Add check constraints for valid values
ALTER TABLE np_personnel ADD CONSTRAINT np_personnel_employment_type_check
  CHECK (employment_type = ANY (ARRAY['full-time'::text, 'part-time'::text, 'hourly'::text, 'contract'::text, 'seasonal'::text]));

ALTER TABLE np_personnel ADD CONSTRAINT np_personnel_contract_type_check
  CHECK (contract_type = ANY (ARRAY['hourly'::text, 'monthly'::text, 'annual'::text, 'project'::text, 'ongoing'::text]));
