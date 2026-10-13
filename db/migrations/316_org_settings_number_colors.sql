-- Display preference for the whole workspace: show positive amounts in green and negative amounts in red.
-- Off by default: amounts keep the normal text color and negatives show in brackets.
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS show_number_colors BOOLEAN NOT NULL DEFAULT FALSE;
