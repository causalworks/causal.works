'use strict';

// 'staff' is the pre-Step-C role name; 'finance' is its replacement (same
// full-access-including-personnel behavior -- see
// .claude/plans/2026-09-19-solid-odi-demo-readiness.md). Both are accepted
// wherever 'finance' access is intended until Step C's data cutover
// (`UPDATE org_users SET role = 'finance' WHERE role = 'staff'`) actually
// runs. Pulled out of requireOrgMembership.js into its own module so both
// requireOrgMembership.js and programScope.js can depend on it without a
// require() cycle between the two.
const FINANCE_ROLES = ['finance', 'staff'];

// Fundraising role (migration 263): scopes donor/gift/campaign data, which has no program
// dimension in the schema. Admin always has full access on top of this -- callers that want
// "admin or fundraising" should list both explicitly, this constant is fundraising-only.
const FUNDRAISING_ROLES = ['fundraising'];

module.exports = { FINANCE_ROLES, FUNDRAISING_ROLES };
