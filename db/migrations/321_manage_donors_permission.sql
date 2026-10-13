-- Manager permission for individual donors, separate from manage_funding (grants and funder organizations).
--   manage_funding   grants, grant allocations, and funder organizations (contacts of kind organization) with their gifts and interactions
--   manage_donors    individual donors with their gifts and interactions; also lets the person read individual donor details
ALTER TABLE org_access_permissions DROP CONSTRAINT org_access_permissions_permission_check;
ALTER TABLE org_access_permissions ADD CONSTRAINT org_access_permissions_permission_check CHECK (permission = ANY (ARRAY[
  'reports','accounting_read','donor_details',
  'manage_budget','manage_personnel','manage_funding','manage_compliance','manage_sponsorship','manage_structure','manage_donors']));
