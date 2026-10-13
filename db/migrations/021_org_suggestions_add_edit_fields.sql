-- 021_org_suggestions_add_edit_fields.sql
-- Add editable metadata to pick-list suggestions.

ALTER TABLE org_suggestions
  ADD COLUMN IF NOT EXISTS ein TEXT;

ALTER TABLE org_suggestions
  ADD COLUMN IF NOT EXISTS propublica_verified BOOLEAN NOT NULL DEFAULT false;
