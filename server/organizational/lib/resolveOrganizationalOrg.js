'use strict';

const { enterOrgContext } = require('./orgContext');

async function orgIdForMember(pool, userId, slug) {
  const r = await pool.query(`SELECT resolve_member_org_id($1, $2, false) AS org_id`, [userId, slug]);
  const orgId = r.rows.length && r.rows[0].org_id != null ? r.rows[0].org_id : null;
  if (orgId != null) enterOrgContext(orgId);
  return orgId;
}

async function orgIdForAdminMember(pool, userId, slug) {
  const r = await pool.query(`SELECT resolve_member_org_id($1, $2, true) AS org_id`, [userId, slug]);
  const orgId = r.rows.length && r.rows[0].org_id != null ? r.rows[0].org_id : null;
  if (orgId != null) enterOrgContext(orgId);
  return orgId;
}

module.exports = { orgIdForMember, orgIdForAdminMember };
