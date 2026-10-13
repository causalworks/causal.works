'use strict';

const { FINANCE_ROLES } = require('./orgRoles');

function programScopeFor(req) {
  if (req.seeAllPrograms === true) return null;
  if (Array.isArray(req.accessPermissions) && req.accessPermissions.some((p) => p === 'reports' || p === 'accounting_read')) return null;
  if (req.coopOrgRole === 'admin' || FINANCE_ROLES.includes(req.coopOrgRole)) {
    return null;
  }
  if (req.coopOrgRole === 'program') {
    return req.coopOrgProgramIds || [];
  }
  return [];
}

function appendProgramScopeClause(req, column, params) {
  const scope = programScopeFor(req);
  if (scope === null) return '';
  params.push(scope);
  return ` AND ${column} = ANY($${params.length}::int[])`;
}

function appendProgramScopeExistsClause(req, { linesTable, fkColumn, parentIdExpr }, params) {
  const scope = programScopeFor(req);
  if (scope === null) return '';
  params.push(scope);
  return ` AND EXISTS (SELECT 1 FROM ${linesTable} WHERE ${fkColumn} = ${parentIdExpr} AND program_id = ANY($${params.length}::int[]))`;
}

// mutating). Non-program roles (scope === null) always pass.
function headerProgramsInScope(req, linePrograms) {
  const scope = programScopeFor(req);
  if (scope === null) return true;
  return linePrograms.every((pid) => scope.includes(pid));
}

module.exports = { programScopeFor, appendProgramScopeClause, appendProgramScopeExistsClause, headerProgramsInScope };
