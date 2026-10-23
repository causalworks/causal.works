'use strict';

const { FINANCE_ROLES } = require('../lib/orgRoles');
const { headerProgramsInScope } = require('../lib/programScope');

const ADMIN_FINANCE = ['admin', ...FINANCE_ROLES];
const AREAS = {
  budget:      { who: 'finance, admins and the Budget manager', roles: ADMIN_FINANCE, manager: 'manage_budget' },
  scenarios:   { who: 'finance, admins, program leads and the Budget manager', roles: [...ADMIN_FINANCE, 'program'], manager: 'manage_budget' },
  personnel:   { who: 'finance and admins', roles: ADMIN_FINANCE, manager: 'manage_personnel' },
  actuals:     { who: 'finance and admins', roles: ADMIN_FINANCE },
  funding:     { who: 'finance, admins, fundraising and program leads', roles: [...ADMIN_FINANCE, 'fundraising', 'program'], manager: 'manage_funding' },
  funder_records: { who: 'finance, admins, fundraising and the Funding manager', roles: [...ADMIN_FINANCE, 'fundraising'], manager: 'manage_funding' },
  donors:      { who: 'finance, admins, fundraising and the Donors manager', roles: [...ADMIN_FINANCE, 'fundraising'], manager: 'manage_donors' },
  allocations: { who: 'finance, admins and fundraising', roles: [...ADMIN_FINANCE, 'fundraising'], manager: 'manage_funding' },
  finance:     { who: 'finance and admins', roles: ADMIN_FINANCE },
  compliance:  { who: 'finance and admins', roles: ADMIN_FINANCE, manager: 'manage_compliance' },
  sponsorship: { who: 'finance, admins and the project\'s program lead', roles: [...ADMIN_FINANCE, 'program'], manager: 'manage_sponsorship' },
  structure:   { who: 'finance, admins and the Structure manager', roles: ADMIN_FINANCE, manager: 'manage_structure' },
  membership:  { who: 'finance, admins, fundraising and the Membership manager', roles: [...ADMIN_FINANCE, 'fundraising'], manager: 'manage_membership' },
  admin:       { who: 'admins', roles: ['admin'] },
};

const READ_AREAS = {
  personnel_pay: { who: 'finance, admins, board members and the Personnel manager', roles: [...ADMIN_FINANCE, 'board'], manager: 'manage_personnel' },
  audit_log:     { who: 'finance and admins', roles: ADMIN_FINANCE },
  finance_admin: { who: 'finance and admins', roles: ADMIN_FINANCE },
  org_summary:   { who: 'finance, admins and board members', roles: [...ADMIN_FINANCE, 'board'] },
  membership:    { who: 'finance, admins, fundraising, the Membership manager and people with access to donor details', roles: [...ADMIN_FINANCE, 'fundraising'], manager: 'manage_membership', permissions: ['donor_details', 'manage_donors'] },
  membership_summary: { who: 'finance, admins, fundraising, board members, the Membership manager and people with access to donor details', roles: [...ADMIN_FINANCE, 'fundraising', 'board'], manager: 'manage_membership', permissions: ['donor_details', 'manage_donors'] },
  sponsorship:   { who: 'finance, admins, board members, the Sponsorship manager and the project\'s program lead', roles: [...ADMIN_FINANCE, 'board', 'program'], manager: 'manage_sponsorship' },
  financial_reports: { who: 'finance, admins, board members and people with Reports access', roles: [...ADMIN_FINANCE, 'board'], permissions: ['reports', 'accounting_read'] },
  budget_plan:   { who: 'finance, admins, board members, program leads (their own programs), the Budget manager and people with Reports access', roles: [...ADMIN_FINANCE, 'board', 'program'], manager: 'manage_budget', permissions: ['reports', 'accounting_read'] },
  grants_read:   { who: 'finance, admins, fundraising, board members, program leads (their own programs), the Funding manager and people with Reports access', roles: [...ADMIN_FINANCE, 'fundraising', 'board', 'program'], manager: 'manage_funding', permissions: ['reports', 'accounting_read'] },
  activity_feed: { who: 'finance, admins, fundraising, board members, program leads, the Budget or Funding manager and people with Reports access', roles: [...ADMIN_FINANCE, 'fundraising', 'board', 'program'], manager: 'manage_budget', permissions: ['reports', 'accounting_read', 'manage_funding'] },
};

function canRead(req, area) {
  const rule = READ_AREAS[area];
  if (!rule) return false;
  if (rule.roles.includes(req.coopOrgRole)) return true;
  const perms = req.accessPermissions || [];
  if (rule.permissions && rule.permissions.some((p) => perms.includes(p))) return true;
  return !!(rule.manager && perms.includes(rule.manager));
}

function requireReadAccess(area) {
  if (!READ_AREAS[area]) throw new Error('requireReadAccess: unknown area ' + area);
  const mw = function (req, res, next) {
    if (canRead(req, area)) return next();
    return res.status(403).json({ code: 'no_read_access', error: 'This is for ' + READ_AREAS[area].who + '. Ask an admin if you need access.' });
  };
  mw.readArea = area;
  return mw;
}

function canWrite(req, area) {
  const rule = AREAS[area];
  if (!rule) return false;
  if (rule.roles.includes(req.coopOrgRole)) return true;
  return !!(rule.manager && (req.accessPermissions || []).includes(rule.manager));
}

function requireWriteAccess(area) {
  if (!AREAS[area]) throw new Error('requireWriteAccess: unknown area ' + area);
  const mw = function (req, res, next) {
    if (canWrite(req, area)) return next();
    return res.status(403).json({
      code: 'no_write_access',
      error: 'Changing this is for ' + AREAS[area].who + '. Ask an admin if you need access.',
    });
  };
  mw.writeArea = area;
  return mw;
}

function requireContactWrite(kindsOf) {
  const mw = async function (req, res, next) {
    try {
      const kinds = (await kindsOf(req)).map((k) => (k === 'organization' ? 'organization' : 'individual'));
      const need = new Set(kinds.length ? kinds : ['individual']);
      for (const k of need) {
        const area = k === 'organization' ? 'funder_records' : 'donors';
        if (!canWrite(req, area)) {
          return res.status(403).json({ code: 'no_write_access', error: 'Changing this is for ' + AREAS[area].who + '. Ask an admin if you need access.' });
        }
      }
      return next();
    } catch (e) {
      console.error('requireContactWrite:', e.message);
      return res.status(500).json({ error: 'Could not check your permission' });
    }
  };
  mw.writeArea = 'funder_records|donors';
  return mw;
}

function leadMayTouch(req, programIds) {
  if (req.coopOrgRole !== 'program') return true;
  const ids = (programIds || []).filter((p) => p != null).map(Number);
  return ids.length > 0 && headerProgramsInScope(req, ids);
}

function leadOwnsScenario(pool) {
  return async function (req, res, next) {
    if (req.coopOrgRole !== 'program' || (req.accessPermissions || []).includes('manage_budget')) return next();
    try {
      const id = Number.parseInt(String(req.params.id), 10);
      const r = await pool.query('SELECT created_by FROM org_budget_scenarios WHERE id = $1 AND org_id = $2', [id, req.orgId]);
      const uid = req.user && (req.user.user_id ?? req.user.id);
      if (r.rows.length && r.rows[0].created_by != null && Number(r.rows[0].created_by) === Number(uid)) return next();
      if (!r.rows.length) return next();
    } catch (e) { console.error('leadOwnsScenario:', e.message); }
    return res.status(403).json({ code: 'not_your_scenario', error: 'You can change only scenarios you created. A Budget manager, finance or an admin can change any scenario.' });
  };
}

async function boardApproverAllowed(pool, orgId) {
  const r = await pool.query(
    `SELECT COALESCE((SELECT board_may_approve FROM org_settings WHERE org_id = $1), false) AS on_,
            (SELECT COUNT(*) FROM org_users WHERE org_id = $1 AND role::text = ANY ($2)) AS n`,
    [orgId, ['admin', ...FINANCE_ROLES]]);
  return !!r.rows[0].on_ && Number(r.rows[0].n) <= 2;
}

module.exports = { requireWriteAccess, requireContactWrite, requireReadAccess, canRead, READ_AREAS, canWrite, leadMayTouch, leadOwnsScenario, boardApproverAllowed, AREAS };
