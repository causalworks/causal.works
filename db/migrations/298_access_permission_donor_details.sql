-- Third access permission (2026-10-04): 'donor_details' = read-only access to donor and contact details, donor reports and
-- the giving summary, for board members who help with fundraising. Same rules as the other two (ongoing or 30 days,
-- renewable, reason required, never allows changes). See migration 296.
ALTER TABLE org_access_permissions DROP CONSTRAINT IF EXISTS org_access_permissions_permission_check;
ALTER TABLE org_access_permissions ADD CONSTRAINT org_access_permissions_permission_check
  CHECK (permission IN ('reports', 'accounting_read', 'donor_details'));
