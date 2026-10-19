'use strict';

const CONTACT_KINDS = new Set(['individual', 'organization']);
const ORG_TYPES = new Set(['foundation', 'corporate', 'government', 'nonprofit', 'member_organization']);
const CONTACT_ROLES = new Set(['donor', 'vendor', 'customer', 'board_member', 'staff', 'dues_member']);
const WRITABLE_ROLES = new Set(['donor', 'vendor', 'customer', 'board_member', 'dues_member']);

const CURRENT_ROLE_CONDITION = `r.starts_on <= CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on > CURRENT_DATE)`;

const ROLES_SELECT = `COALESCE((SELECT array_agg(r.role ORDER BY r.role) FROM org_contact_roles r
   WHERE r.constituent_id = c.id AND ${CURRENT_ROLE_CONDITION}), '{}') AS roles`;

function hasRoleCondition(role) {
  return `EXISTS (SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = c.id AND r.role = '${role}' AND ${CURRENT_ROLE_CONDITION})`;
}

function parseRoles(input) {
  if (!Array.isArray(input)) return { error: 'roles must be a list' };
  const roles = [...new Set(input.map((r) => String(r).trim().toLowerCase()).filter(Boolean))];
  for (const r of roles) {
    if (!CONTACT_ROLES.has(r)) return { error: 'Invalid role: ' + r };
    if (!WRITABLE_ROLES.has(r)) return { error: 'Role not available yet: ' + r };
  }
  return { roles };
}

function parseKindFields(body, existing) {
  let kind = body.kind !== undefined ? String(body.kind).trim().toLowerCase()
    : existing ? existing.kind
    : (body.first_name || body.last_name) ? 'individual' : 'organization';
  if (!CONTACT_KINDS.has(kind)) return { error: 'kind must be individual or organization' };
  let orgType = body.org_type !== undefined ? (String(body.org_type || '').trim().toLowerCase() || null)
    : existing ? existing.org_type : null;
  if (kind === 'individual') orgType = null;
  if (orgType !== null && !ORG_TYPES.has(orgType)) return { error: 'Invalid org_type' };
  return { kind, org_type: orgType };
}

async function addContactRoles(client, orgId, constituentId, roles) {
  for (const role of roles) {
    await client.query(
      `INSERT INTO org_contact_roles (org_id, constituent_id, role)
       SELECT $1, $2, $3
        WHERE NOT EXISTS (SELECT 1 FROM org_contact_roles r
                           WHERE r.constituent_id = $2 AND r.role = $3 AND ${CURRENT_ROLE_CONDITION})
       ON CONFLICT (constituent_id, role, starts_on) DO UPDATE SET ends_on = NULL`,
      [orgId, constituentId, role]
    );
  }
}

async function setContactRoles(client, orgId, constituentId, roles) {
  await client.query(
    `UPDATE org_contact_roles r SET ends_on = CURRENT_DATE
      WHERE r.constituent_id = $1 AND r.org_id = $2 AND ${CURRENT_ROLE_CONDITION} AND NOT (r.role = ANY($3::text[]))`,
    [constituentId, orgId, roles]
  );
  await addContactRoles(client, orgId, constituentId, roles);
}

module.exports = {
  CONTACT_KINDS, ORG_TYPES, CONTACT_ROLES, WRITABLE_ROLES,
  ROLES_SELECT, hasRoleCondition, parseRoles, parseKindFields, addContactRoles, setContactRoles,
};
