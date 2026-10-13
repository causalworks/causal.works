'use strict';

function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform admin access required.' });
  }
  next();
}

function requirePlatformAdminPage(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.redirect(302, '/organizational/');
  }
  next();
}

module.exports = { requirePlatformAdmin, requirePlatformAdminPage };
