-- Manager permissions: per-person, per-area permission to change an area's records, on top of a role.
-- Same model as the read-only access permissions (migration 296): reason, ongoing or 30 days, renewable, logged.
--   manage_budget       budget lines, scenarios, schedules; accepts a program lead's scenario (promote)
--   manage_personnel    personnel records (extra permission, given to a Budget manager)
--   manage_funding      grants and grant allocations
--   manage_compliance   compliance obligations
--   manage_sponsorship  sponsored projects
--   manage_structure    chart of accounts, programs, funds (not yet enforced)
ALTER TABLE org_access_permissions DROP CONSTRAINT org_access_permissions_permission_check;
ALTER TABLE org_access_permissions ADD CONSTRAINT org_access_permissions_permission_check CHECK (permission = ANY (ARRAY[
  'reports','accounting_read','donor_details',
  'manage_budget','manage_personnel','manage_funding','manage_compliance','manage_sponsorship','manage_structure']));
