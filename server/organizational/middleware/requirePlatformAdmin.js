'use strict';

// Platform-wide admin gate, distinct from requireOrgRole('admin') (which is
// scoped to one org via :slug). Backs users.is_platform_admin (migration 169) -
// used only by the coop-wide Pod Management view, which spans every org and so
// can't be gated by any single org's membership/role.

/** Use after requireAuth. JSON APIs — 403. */
function requirePlatformAdmin(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.status(403).json({ error: 'Platform admin access required.' });
  }
  next();
}

/** Use after requireAuthPage. Browser — redirect rather than a bare 403 page. */
function requirePlatformAdminPage(req, res, next) {
  if (!req.user || !req.user.is_platform_admin) {
    return res.redirect(302, '/organizational/');
  }
  next();
}

module.exports = { requirePlatformAdmin, requirePlatformAdminPage };
