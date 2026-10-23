-- Org-side turnaround id for the fifth turnaround is 'empowerment', matching the framework list.
BEGIN;
ALTER TABLE coop_members DROP CONSTRAINT coop_members_cooperative_turnarounds_check;
UPDATE coop_members SET cooperative_turnarounds = array_replace(cooperative_turnarounds, 'womens_empowerment', 'empowerment') WHERE 'womens_empowerment' = ANY(cooperative_turnarounds);
ALTER TABLE coop_members ADD CONSTRAINT coop_members_cooperative_turnarounds_check
  CHECK (array_length(cooperative_turnarounds, 1) IS NULL OR cooperative_turnarounds <@ ARRAY['energy','food','inequality','poverty','empowerment']);
UPDATE workshop_interventions SET turnaround_ids = array_replace(turnaround_ids, 'womens_empowerment', 'empowerment') WHERE 'womens_empowerment' = ANY(turnaround_ids);
UPDATE workshop_projects SET e4a_turnarounds = array_replace(e4a_turnarounds, 'womens_empowerment', 'empowerment') WHERE 'womens_empowerment' = ANY(e4a_turnarounds);
UPDATE workshop_workspaces SET e4a_turnarounds = array_replace(e4a_turnarounds, 'womens_empowerment', 'empowerment') WHERE 'womens_empowerment' = ANY(e4a_turnarounds);
UPDATE workshop_documents SET e4a_turnarounds = array_replace(e4a_turnarounds, 'womens_empowerment', 'empowerment') WHERE 'womens_empowerment' = ANY(e4a_turnarounds);
COMMIT;
