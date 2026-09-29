'use strict';

const { AsyncLocalStorage } = require('async_hooks');

// RLS enforcement, part 2: automatic per-request scoping.
//
// Two independent pieces of context get entered at different points in a
// request's lifecycle and merged into the same store:
//   - userId, entered by requireAuth() (server/auth.js) the moment a
//     session resolves -- for EVERY authenticated request, org-scoped or
//     not (harmless no-op outside the Organizational workspace, since
//     scopedPool.js is the only consumer and it's only used there).
//   - orgId, entered later, once a route actually resolves which org a
//     request is scoped to (orgIdForMember()/orgIdForAdminMember()
//     in resolveOrganizationalOrg.js, or requireOrgMembership.js).
//
// requestContextMiddleware() below MUST be mounted once, globally, before
// any route that calls enterOrgContext()/enterUserContext() -- it opens a
// storage.run() for the entire remainder of the request via next(), which
// creates a store object genuinely exclusive to that one request. Both
// enter*Context() calls just mutate that object in place.
//
// This deliberately does NOT use storage.enterWith() the way an earlier
// version of this file did. enterWith() sets context for "the rest of the
// current async execution" -- which sounds request-scoped but isn't
// reliably so under concurrent load: it showed up live as org context from
// one request bleeding into an unrelated concurrent request (Postgres
// throwing "invalid input syntax for type integer" from a stale/garbage
// app.current_org_id GUC on routes that never set one), reproducing faster
// under rapid clicking and disappearing when requests were spaced out --
// the signature of a shared-context race, not a per-call-site bug.
// storage.run(store, callback) is the pattern Node's own docs use for HTTP
// servers specifically because it binds a fresh store to one callback's
// causal chain with no ambient/ambiguous "current" context to leak from.
//
// Both fields exist because they close different gaps in org_users' RLS
// policy (migration 137, extended by 152): the org-scoped policy alone
// can't be satisfied before an org id is known (the bootstrapping problem
// migrations 148/150/151's SECURITY DEFINER functions work around at
// specific call sites); a second, SELECT-only self-visibility policy keyed
// on current_user_id (migration 152) closes that gap generally, for any
// query -- present or future -- that looks up a user's own org_users rows
// before an org context exists, without needing to audit every call site.

const storage = new AsyncLocalStorage();

/** Mount once, globally, before any route. Gives every request its own isolated store. */
function requestContextMiddleware(req, res, next) {
  storage.run({}, next);
}

function enterOrgContext(orgId) {
  const store = storage.getStore();
  if (store) store.orgId = orgId;
}

function enterUserContext(userId) {
  const store = storage.getStore();
  if (store) store.userId = userId;
}

// RLS enforcement, part 4 (2026-09-20): the program-scoping RLS backstop
// (migration 259). `scope` is null/undefined ("no restriction" -- admin,
// finance, legacy staff) or an array of program ids, possibly empty ("this
// program-role caller has zero grants, sees no rows") -- the exact shape
// programScope.js's programScopeFor() already returns for app-layer
// filtering. Kept as a third context field rather than folded into orgId,
// since most requests never call this at all (only requireOrgMembership.js
// does, once per request, right after resolving role/program_ids).
function enterProgramScope(scope) {
  const store = storage.getStore();
  if (store) store.programScope = scope ?? null;
}

function getCurrentOrgId() {
  const store = storage.getStore();
  return store ? store.orgId ?? null : null;
}

function getCurrentUserId() {
  const store = storage.getStore();
  return store ? store.userId ?? null : null;
}

function getCurrentProgramScope() {
  const store = storage.getStore();
  return store ? store.programScope ?? null : null;
}

module.exports = {
  requestContextMiddleware,
  enterOrgContext,
  enterUserContext,
  enterProgramScope,
  getCurrentOrgId,
  getCurrentUserId,
  getCurrentProgramScope,
};
