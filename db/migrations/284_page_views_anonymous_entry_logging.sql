-- 284: allow page_views to log anonymous entry-point hits (splash page views, demo-route
-- clicks) so we can see aggregate traffic through the pre-signup funnel -- e.g. how many
-- ODI reviewers hit the splash page and which demo card they chose -- without needing to
-- identify or tie the hit to any specific person. user_id stays required for every existing
-- authenticated-page-view call site (server/auth.js's requireAuthPage); this only widens the
-- column so a small number of new, deliberately-anonymous call sites can log without one.

ALTER TABLE page_views ALTER COLUMN user_id DROP NOT NULL;
