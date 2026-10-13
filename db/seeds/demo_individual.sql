-- =============================================================================
-- INDIVIDUAL APP (Agency) DEMO USER SEED  --  db/seeds/demo_individual.sql
-- =============================================================================
-- Run     : sudo -u postgres psql causal_db -f db/seeds/demo_individual.sql
-- Re-run  : idempotent — deletes and recreates the demo user each time
--
-- MAINTAINER NOTES
-- ─────────────────
-- This script only sets up the static parts of the demo (user row, org follows,
-- donations). The dynamic parts (completed-action ledger, org subscriptions)
-- are reset on every /demo visit by the DEMO_CONFIG block in server/server.js.
--
-- To change the demo persona city/bank/priorities → edit DEMO_CONFIG in server.js
-- To change which orgs appear in the feed → edit DEMO_CONFIG.feed_org_ids
--   (find orgs with live actions: SELECT DISTINCT org_id FROM actions WHERE source='causal')
-- To change Give-tab donation history → edit section 4 below
-- To add the demo user to a new instance → just re-run this script
-- =============================================================================

BEGIN;

-- ── 1. TEARDOWN (FK-safe order) ───────────────────────────────────────────────

DELETE FROM sessions              WHERE user_id IN (SELECT id FROM users WHERE user_type = 'demo');
DELETE FROM contributions         WHERE user_id IN (SELECT id FROM users WHERE user_type = 'demo');
DELETE FROM user_actions          WHERE user_id IN (SELECT id FROM users WHERE user_type = 'demo');
DELETE FROM user_org_preferences  WHERE user_id IN (SELECT id FROM users WHERE user_type = 'demo');
DELETE FROM user_contributed_orgs WHERE user_id IN (SELECT id FROM users WHERE user_type = 'demo');
DELETE FROM users                 WHERE user_type = 'demo';


-- ── 2. DEMO USER ──────────────────────────────────────────────────────────────
-- Profile fields are also reset on every /demo visit via DEMO_CONFIG in server.js.
-- Keep these in sync with that config object.

INSERT INTO users (
  email, forwarding_address, causal_address,
  user_type, bank,
  location_country, location_zip, location_city,
  turnaround_priorities, action_type_prefs,
  coop_access, onboarded
) VALUES (
  'demo@causal.works',
  'push-demo00@inbound.causal.works',
  'demouser@causal.works',
  'demo',
  'wells fargo',
  'US', '97201', 'Portland',
  '{Energy,Inequality}',
  '{contact,petition,comment}',
  true, true
);


-- ── 3. CONTRIBUTED ORGS (Give tab / manual donation tracking) ─────────────────
-- These are display-only org names, not linked to the action feed.
-- Update if you want different orgs to appear in the Give tab.

INSERT INTO user_contributed_orgs (user_id, org_name, propublica_verified, added_at)
SELECT u.id, v.org_name, false, NOW() - v.ago::interval
FROM users u,
(VALUES
  ('350.org',          '6 months'),
  ('Sierra Club',      '4 months'),
  ('Sunrise Movement', '6 weeks')
) AS v(org_name, ago)
WHERE u.user_type = 'demo';


-- ── 4. DONATIONS (Give tab + Ledger position) ─────────────────────────────────
-- Org IDs: 4=350.org, 17=Sierra Club, 23=Sunrise Movement.
-- Update amounts/dates to show realistic giving history.

INSERT INTO contributions (user_id, org_name, org_id, amount_cents, currency, contributed_at, source)
SELECT u.id, v.org_name, v.org_id, v.cents, 'USD', NOW() - v.ago::interval, 'manual'
FROM users u,
(VALUES
  ('Sierra Club',      17,  2500, '8 weeks'),
  ('350.org',           4,  5000, '5 weeks'),
  ('Sunrise Movement', 23, 10000, '2 weeks')
) AS v(org_name, org_id, cents, ago)
WHERE u.user_type = 'demo';

-- NOTE: Org subscriptions (user_org_preferences) and the completed-action ledger
-- (user_actions) are NOT seeded here. The /demo route populates them dynamically
-- on each visit using DEMO_CONFIG.feed_org_ids. This keeps them current as new
-- actions arrive without requiring a manual seed re-run.

COMMIT;
