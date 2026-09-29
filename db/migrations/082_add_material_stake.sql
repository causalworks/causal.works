-- Add material_stake column to actions table
-- Stores quantified personal financial impact of an action (e.g. "~$240/yr on your electricity bill")
-- Presence-sorted: actions with a specific stake rank higher than those without
-- NULL values are expected and valid (most actions won't have a quantified personal stake)

ALTER TABLE actions ADD COLUMN material_stake TEXT;
