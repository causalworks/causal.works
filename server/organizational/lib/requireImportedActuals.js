'use strict';

// Importing actuals from Xero or a spreadsheet only makes sense when the org's books live outside
// Causal (org_settings.actuals_source = 'xero'). For an org whose books are in Causal's ledger the DB
// rejects those rows (org_enforce_actuals_source_writer), so say so plainly up front instead of
// failing mid-import with a constraint error.
function requireImportedActuals(pool) {
  return async (req, res, next) => {
    try {
      const r = await pool.query(`SELECT COALESCE(actuals_source, 'ledger') AS s FROM org_settings WHERE org_id = $1`, [req.orgId]);
      const source = r.rows[0] ? r.rows[0].s : 'ledger';
      if (source !== 'xero') {
        return res.status(409).json({
          code: 'actuals_source_ledger',
          error: 'Your books are set to live in Causal, so actuals come from your ledger. To import actuals from Xero or a spreadsheet, change Settings > Where your books live to "In Xero or another tool" first.',
        });
      }
      return next();
    } catch (e) {
      console.error('requireImportedActuals:', e.message);
      return res.status(500).json({ error: 'Could not check the data source setting' });
    }
  };
}

module.exports = { requireImportedActuals };
