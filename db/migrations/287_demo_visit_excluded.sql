-- Staff devices to leave out of the demo visitor counts (see 286_demo_visit_log.sql).
-- The visit log stores only a one-way hash of IP + browser, never an email, so staff are excluded
-- by device: when a staff account (DEMO_VISIT_EXCLUDED_EMAILS in server/server.js) is signed in
-- and opens a demo link or /admin, the server records that browser's hash here. The summary then
-- leaves out every logged visit with that hash, including visits logged before it was learned.
-- No email is stored. Drop together with demo_visit_log / demo_visit_key after 2026-10-14.

CREATE TABLE IF NOT EXISTS demo_visit_excluded (
  visitor_hash text PRIMARY KEY,
  added_at     timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON demo_visit_excluded TO causal_app;
