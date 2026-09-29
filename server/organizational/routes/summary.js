'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { getOrganizationalExecutiveSummaryText } = require('../lib/OrganizationalSummaryService');

function registerOrganizationalSummaryRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const refresh = req.query.refresh === '1' || String(req.query.refresh || '').toLowerCase() === 'true';
    const fyRaw = req.query.fiscal_year;
    const fiscalYear =
      fyRaw != null && String(fyRaw).trim() !== ''
        ? Number.parseInt(String(fyRaw), 10)
        : new Date().getUTCFullYear();
    if (!Number.isInteger(fiscalYear) || fiscalYear < 1900 || fiscalYear > 2200) {
      return res.status(400).json({ error: 'fiscal_year invalid' });
    }

    try {
      const out = await getOrganizationalExecutiveSummaryText(pool, orgId, fiscalYear, { refresh });
      return res.json({
        summary: out.summary,
        cached: out.cached,
        generated_at: out.generated_at,
        fiscal_year: fiscalYear,
        source: out.cached ? 'cache' : out.source,
      });
    } catch (e) {
      console.error('GET /summary:', e.message);
      return res.status(500).json({ error: 'Could not build summary' });
    }
  });
}

module.exports = { registerOrganizationalSummaryRoutes };
