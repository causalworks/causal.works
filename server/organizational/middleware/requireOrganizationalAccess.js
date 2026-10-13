'use strict';

function normalizeOrganizationalAccess(user) {
  if (!user) return false;
  const v = user.coop_access;
  return v === true || v === 't' || v === 1;
}

function requireOrganizationalAccess(req, res, next) {
  if (!normalizeOrganizationalAccess(req.user)) {
    return res.status(403).json({ error: 'Cooperative workspace is not enabled for this account.' });
  }
  next();
}

function requireOrganizationalAccessPage(req, res, next) {
  if (!normalizeOrganizationalAccess(req.user)) {
    return res.redirect(302, '/app.html?coop=disabled');
  }
  next();
}

module.exports = { requireOrganizationalAccess, requireOrganizationalAccessPage, normalizeOrganizationalAccess };
