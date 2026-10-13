'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

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

function enterProgramScope(scope) {
  const store = storage.getStore();
  if (store) store.programScope = scope ?? null;
}

function keepContext(middleware) {
  return function (req, res, next) {
    const store = storage.getStore();
    middleware(req, res, (err) => {
      if (err || !store) return next(err);
      storage.run(store, () => next());
    });
  };
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
  keepContext,
  getCurrentOrgId,
  getCurrentUserId,
  getCurrentProgramScope,
};
