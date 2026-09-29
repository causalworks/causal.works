'use strict';

// Shared scoping helper for the org-level internal permission system
// (.claude/plans/2026-09-19-solid-odi-demo-readiness.md). A 'program'-role
// caller's requests must be filtered to only the program_id(s) in
// req.coopOrgProgramIds; every other role (admin, finance, and legacy
// 'staff' via FINANCE_ROLES until Step C's data cutover) sees everything,
// unaffected.
//
// Deliberately does not touch Personnel -- personnel visibility for the
// 'program' role is allocation-only (see the plan doc), a field-level
// masking concern with its own separate query shape, not a row-level
// program_id filter this helper is built for.

const { FINANCE_ROLES } = require('./orgRoles');

// Returns null when the caller sees everything (no filter needed), or the
// array of program_ids to restrict to (possibly empty, meaning "sees no
// rows" -- a program-role person with no grants yet, not an error
// condition; callers should render that as a real empty state, not crash).
function programScopeFor(req) {
  if (req.coopOrgRole === 'admin' || FINANCE_ROLES.includes(req.coopOrgRole)) {
    return null;
  }
  if (req.coopOrgRole === 'program') {
    return req.coopOrgProgramIds || [];
  }
  // Unknown/unexpected role -- fail closed (see nothing), not open,
  // matching this codebase's fail-closed RLS convention elsewhere.
  return [];
}

// Convenience for the common case: append "AND <column> = ANY($n)" to a
// query being built with a running params array, only when scoping is
// actually needed. Returns the (possibly empty) SQL fragment; mutates
// `params` by pushing the scope array when it appends a clause. Callers with
// a more complex query shape (joins, multiple candidate columns) should call
// programScopeFor() directly instead of this helper.
function appendProgramScopeClause(req, column, params) {
  const scope = programScopeFor(req);
  if (scope === null) return '';
  params.push(scope);
  return ` AND ${column} = ANY($${params.length}::int[])`;
}

// For header+lines tables (org_bills/org_bill_lines, org_invoices/
// org_invoice_lines, org_expense_claims/org_expense_claim_lines, ...): the
// header row itself carries no program_id (only its child lines do), so the
// RLS backstop on the lines table (migration 259) doesn't protect the
// header. Appends "AND EXISTS (SELECT 1 FROM <linesTable> WHERE
// <fkColumn> = <parentIdExpr> AND program_id = ANY($n))" so a program-role
// caller's header list only surfaces headers that actually have at least
// one line in their scope. table/column names are fixed internal call-site
// constants, never user input.
function appendProgramScopeExistsClause(req, { linesTable, fkColumn, parentIdExpr }, params) {
  const scope = programScopeFor(req);
  if (scope === null) return '';
  params.push(scope);
  return ` AND EXISTS (SELECT 1 FROM ${linesTable} WHERE ${fkColumn} = ${parentIdExpr} AND program_id = ANY($${params.length}::int[]))`;
}

// For header-mutation endpoints (submit/approve/pay/void/patch): a
// program-scoped caller may only act on a header whose lines are ALL within
// their granted program(s) -- not just some -- since these actions post to
// the ledger or change status for the whole record, not a single line.
// `linePrograms` is the array of program_id values already fetched for this
// header's lines (every header+lines module already loads its lines before
// mutating). Non-program roles (scope === null) always pass.
function headerProgramsInScope(req, linePrograms) {
  const scope = programScopeFor(req);
  if (scope === null) return true;
  return linePrograms.every((pid) => scope.includes(pid));
}

module.exports = { programScopeFor, appendProgramScopeClause, appendProgramScopeExistsClause, headerProgramsInScope };
