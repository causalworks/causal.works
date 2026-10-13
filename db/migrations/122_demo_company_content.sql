-- 122: Correct demo content org-attribution + add demo Members/Engagement content.
--
-- Migration 120 attributed the seeded workshop/library demo content to `test-co`
-- (id 43), but the actual demo org used for live testing is `demo-company`
-- (slug demo-company, id 42, display name "Demo Company"). Re-point it, and add
-- a few more member orgs + an engagement item so Members/Engagement have demo
-- content too, all scoped to demo-company only (not visible from other orgs).

UPDATE cooperative_work_library_items
SET source_coop_org_id = (SELECT id FROM coop_orgs WHERE slug = 'demo-company')
WHERE source_coop_org_id = (SELECT id FROM coop_orgs WHERE slug = 'test-co');

-- ── Demo cooperative member orgs (for the Members tab) ─────────────────────
-- These are "other" orgs in the cooperative directory, visible to demo-company
-- (and to each other) via the existing /cooperative/members endpoint, which
-- already excludes the viewer's own org and requires membership_status='active'
-- plus at least one profile field set.

INSERT INTO coop_orgs (display_name, slug, membership_status, mission_summary, location_general, size_band, cooperative_turnarounds, member_since)
VALUES
  ('Org 1', 'demo-org-1', 'active', 'Demo cooperative member organization for testing cross-org features.', 'Portland, OR', '$250K-$500K', ARRAY['poverty', 'inequality'], NOW() - INTERVAL '8 months'),
  ('Org 2', 'demo-org-2', 'active', 'Demo cooperative member organization for testing cross-org features.', 'New Orleans, LA', '$500K-$1M', ARRAY['energy', 'poverty'], NOW() - INTERVAL '5 months'),
  ('Org 3', 'demo-org-3', 'active', 'Demo cooperative member organization for testing cross-org features.', 'Minneapolis, MN', 'under $250K', ARRAY['food', 'poverty'], NOW() - INTERVAL '2 months')
ON CONFLICT (slug) DO NOTHING;

-- ── Demo engagement content (Engagement tab, demo-company only) ────────────
INSERT INTO cooperative_work_library_items (category, title, description, body_markdown, source_coop_org_id, display_order)
SELECT 'engagement_artifact',
       'Communication channels: cooperative Slack + monthly call',
       'Where cooperative members coordinate day to day, and when the recurring sync happens.',
       $md$# Communication Channels

**Slack workspace:** #general, #grants-and-funding, #policy-watch, #bookkeeping-help — invite sent to each member org's primary contact on activation.

**Monthly member call:** first Thursday of the month, 10am PT. Agenda posted in #general 48 hours ahead; notes posted back within a week.

*(Placeholder for full channel directory.)*$md$,
       o.id,
       2
FROM coop_orgs o
WHERE o.slug = 'demo-company'
  AND NOT EXISTS (SELECT 1 FROM cooperative_work_library_items i WHERE i.title = 'Communication channels: cooperative Slack + monthly call');
