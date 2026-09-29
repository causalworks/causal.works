-- Migration 101: Custom fields storage for grant tracker imports
-- extra_data stores fields that don't map to standard grant columns (e.g. "Program Officer", "Contact Email")
ALTER TABLE coop_grants
  ADD COLUMN IF NOT EXISTS extra_data jsonb DEFAULT '{}'::jsonb;
