-- 008_actions_source_causal_addresses.sql
-- Shared-actions architecture: source on actions; causal_address on users and orgs.

-- 1. Add source to actions ('user' = from user forwarding, 'causal' = from org subscription)
ALTER TABLE actions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user';

-- 2. Add causal_address to users (handle@causal.work for subscribing to orgs)
ALTER TABLE users ADD COLUMN IF NOT EXISTS causal_address TEXT UNIQUE;

-- 3. Add causal_address to orgs (e.g. sierraclub@causal.work for Causal's subscription)
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS causal_address TEXT UNIQUE;

-- 4. Seed org causal addresses (Causal's own subscriptions)
UPDATE orgs SET causal_address = 'sierraclub@causal.work' WHERE name = 'Sierra Club';
UPDATE orgs SET causal_address = '350org@causal.work' WHERE name = '350.org';
UPDATE orgs SET causal_address = 'aclu@causal.work' WHERE name = 'ACLU';
UPDATE orgs SET causal_address = 'amnesty@causal.work' WHERE name = 'Amnesty International';
UPDATE orgs SET causal_address = 'greenpeace@causal.work' WHERE name = 'Greenpeace International';
UPDATE orgs SET causal_address = 'greenpeacede@causal.work' WHERE name = 'Greenpeace e.V.';
UPDATE orgs SET causal_address = 'oxfam@causal.work' WHERE name = 'Oxfam';
