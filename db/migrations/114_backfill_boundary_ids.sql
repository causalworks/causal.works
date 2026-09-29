-- Backfill boundary_ids/boundary_urgency_score for actions ingested before the
-- AI classifier started setting these columns (server/ai/ai-service.js). Those
-- actions already carry turnaround_category/secondary_turnarounds; this derives
-- boundary_ids from that existing data via the same turnaround->boundary
-- mapping defined in server/data/planetary-boundaries.js (turnaround_ids per
-- boundary, inverted here). Case-insensitive match: turnaround values in the
-- DB are capitalized ("Energy"), boundaries.js ids are lowercase ("energy").
--
-- Only touches rows where boundary_ids is currently empty — never overwrites
-- AI-classified data.

BEGIN;

WITH turnaround_boundary_map(turnaround, boundary, severity) AS (
  VALUES
    ('energy',      'climate',    3),
    ('energy',      'ocean',      1),
    ('energy',      'aerosol',    0),
    ('energy',      'ozone',      0),
    ('food',        'climate',    3),
    ('food',        'biosphere',  3),
    ('food',        'land',       2),
    ('food',        'freshwater', 2),
    ('food',        'biogeochem', 2),
    ('food',        'ocean',      1),
    ('empowerment', 'biosphere',  3),
    ('empowerment', 'ozone',      0),
    ('poverty',     'freshwater', 2),
    ('poverty',     'novel',      1),
    ('inequality',  'novel',      1)
),
action_turnarounds AS (
  SELECT a.id,
         ARRAY(
           SELECT DISTINCT lower(t)
           FROM unnest(array_remove(ARRAY[a.turnaround_category] || COALESCE(a.secondary_turnarounds, '{}'), NULL)) AS t
         ) AS turnarounds
  FROM actions a
  WHERE (a.boundary_ids IS NULL OR array_length(a.boundary_ids, 1) IS NULL)
    AND (a.turnaround_category IS NOT NULL
         OR (a.secondary_turnarounds IS NOT NULL AND array_length(a.secondary_turnarounds, 1) > 0))
),
action_boundaries AS (
  SELECT at.id,
         ARRAY(
           SELECT DISTINCT m.boundary
           FROM unnest(at.turnarounds) AS turn
           JOIN turnaround_boundary_map m ON m.turnaround = turn
         ) AS boundary_ids,
         COALESCE(
           (SELECT MAX(m.severity)
            FROM unnest(at.turnarounds) AS turn
            JOIN turnaround_boundary_map m ON m.turnaround = turn),
           0
         ) AS boundary_urgency_score
  FROM action_turnarounds at
)
UPDATE actions a
SET boundary_ids = ab.boundary_ids,
    boundary_urgency_score = ab.boundary_urgency_score
FROM action_boundaries ab
WHERE a.id = ab.id
  AND array_length(ab.boundary_ids, 1) > 0;

COMMIT;
