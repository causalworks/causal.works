'use strict';

const { FINANCE_ROLES } = require('../lib/orgRoles');
const { enterProgramScope } = require('../lib/orgContext');

const ALWAYS_READ_ROLES = ['admin', ...FINANCE_ROLES, 'program'];

function hasAccountingAccess(req, scope) {
  if (ALWAYS_READ_ROLES.includes(req.coopOrgRole)) return true;
  const perms = req.accessPermissions || [];
  return perms.includes('accounting_read') || (scope === 'reports' && perms.includes('reports'));
}

function requireAccountingAccess(pool, scope) {
  return async function (req, res, next) {
    if (hasAccountingAccess(req, scope)) return next();
    let admins = [];
    try {
      const r = await pool.query(
        `SELECT u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.role = 'admin' ORDER BY ou.id LIMIT 3`,
        [req.orgId]);
      admins = r.rows.map((x) => x.email);
    } catch (e) {  }
    return res.status(403).json({
      code: 'no_access',
      error: scope === 'reports'
        ? 'You do not have access to financial reports in this workspace. Ask an admin to give you access.'
        : 'You do not have access to Accounting in this workspace. Ask an admin to give you access.',
      admins,
    });
  };
}

function boardSeesAllPrograms(req, res, next) {
  if (req.coopOrgRole === 'board') {
    enterProgramScope(null);
    req.seeAllPrograms = true;
  }
  return next();
}

const DONOR_ROLES = ['admin', ...FINANCE_ROLES, 'fundraising'];

function hasDonorAccess(req) {
  const perms = req.accessPermissions || [];
  return DONOR_ROLES.includes(req.coopOrgRole) || perms.includes('donor_details') || perms.includes('manage_donors');
}

function hasFunderAccess(req) {
  return hasDonorAccess(req) || (req.accessPermissions || []).includes('manage_funding');
}

function requireContactRead(pool) {
  return async function (req, res, next) {
    if (hasDonorAccess(req)) { req.contactScope = 'all'; return next(); }
    if (hasFunderAccess(req)) { req.contactScope = 'organizations'; return next(); }
    let admins = [];
    try {
      const r = await pool.query(
        `SELECT u.email FROM org_users ou JOIN users u ON u.id = ou.user_id WHERE ou.org_id = $1 AND ou.role = 'admin' ORDER BY ou.id LIMIT 3`, [req.orgId]);
      admins = r.rows.map((x) => x.email);
    } catch (e) {  }
    return res.status(403).json({ code: 'no_access', error: 'You do not have access to donor details in this workspace. Ask an admin to give you access.', admins });
  };
}

function requireDonorRead(pool) {
  const contactRead = requireContactRead(pool);
  return function (req, res, next) {
    return contactRead(req, res, function (err) {
      if (err) return next(err);
      if (req.contactScope === 'organizations') {
        return res.status(403).json({ code: 'no_access', error: 'This is for people with access to donor details. Ask an admin if you need it.', admins: [] });
      }
      return next();
    });
  };
}

const ENTRY_WRITE_REFUSAL = 'This action requires one of these roles in this organization: admin, finance, staff.';

async function adminEntryState(pool, orgUserId) {
  const r = await pool.query(
    `SELECT ou.accounting_entry_enabled AS entry_on,
            EXISTS (SELECT 1 FROM org_users f WHERE f.org_id = ou.org_id AND f.role IN ('finance', 'staff')) AS has_finance
       FROM org_users ou WHERE ou.id = $1`, [orgUserId]);
  const row = r.rows[0] || {};
  return { entryOn: !!row.entry_on, hasFinance: !!row.has_finance, canEnter: !!row.entry_on || !row.has_finance };
}

function requireAccountingWriter(pool) {
  return async function (req, res, next) {
    if (FINANCE_ROLES.includes(req.coopOrgRole)) return next();
    if (req.coopOrgRole === 'admin') {
      try {
        const st = await adminEntryState(pool, req.coopOrgUserId);
        if (st.canEnter) return next();
        return res.status(403).json({
          code: 'entry_off',
          error: 'Accounting entry is switched off for your admin account. Switch it on under Settings > Organization if you need to enter or change transactions.',
        });
      } catch (e) {
        console.error('requireAccountingWriter:', e.message);
        return res.status(500).json({ error: 'Could not check your accounting entry access' });
      }
    }
    return res.status(403).json({ error: ENTRY_WRITE_REFUSAL });
  };
}

module.exports = { requireAccountingAccess, hasAccountingAccess, boardSeesAllPrograms, hasDonorAccess, hasFunderAccess, requireContactRead, requireDonorRead, requireAccountingWriter, adminEntryState };
