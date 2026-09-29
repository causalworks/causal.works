-- 169: Solid pod provisioning status + platform-admin flag.
--
-- Pod status lives on org_settings (org-private operational config, same home as
-- Xero tokens/onboarding state since the rev45 split) rather than coop_members.
-- pod_provisioned is the idempotency guard for auto-provisioning on org creation
-- (server/organizational/lib/podProvision.js) - never re-run provisioning for an
-- org where this is already true, and never flip it true on a failed attempt.
--
-- Existing orgs are NOT backfilled here (deliberate product decision - auto-
-- provisioning proves the mechanism going forward, backfilling existing orgs,
-- including demo-company and pod-pilot itself, is a separate manual action).

ALTER TABLE org_settings
    ADD COLUMN pod_provisioned boolean NOT NULL DEFAULT false,
    ADD COLUMN pod_provisioned_at timestamp with time zone,
    ADD COLUMN pod_provisioning_error text;

-- Platform-level admin: spans all orgs, distinct from org_users.role='admin'
-- (which is scoped to one org). No UI to manage this yet - flipped manually via
-- SQL. Used to gate the coop-wide Pod Management page.
ALTER TABLE users
    ADD COLUMN is_platform_admin boolean NOT NULL DEFAULT false;
