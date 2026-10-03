'use strict';

// Where an org's "actuals" come from (org_settings.actuals_source): its books in Causal's own ledger
// ('ledger', the default) or imported from Xero / a spreadsheet ('xero'). The DB triggers enforce the
// split and, on a switch, regenerate or replace actuals month by month (migrations 232, 292).

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');

const SOURCES = ['ledger', 'xero'];

function registerActualsSourceRoutes(app, pool) {
  const member = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const admin = [...member, requireOrgRole('admin')];

  async function currentState(orgId) {
    const s = await pool.query(
      `SELECT COALESCE(actuals_source, 'ledger') AS actuals_source, (xero_tenant_id IS NOT NULL) AS xero_connected
         FROM org_settings WHERE org_id = $1`, [orgId]);
    const src = s.rows[0] ? s.rows[0].actuals_source : 'ledger';
    const connected = s.rows[0] ? !!s.rows[0].xero_connected : false;
    // What a switch would do, so the page can warn before anyone confirms.
    const months = await pool.query(
      `SELECT EXTRACT(YEAR FROM t.transaction_date)::int AS y, EXTRACT(MONTH FROM t.transaction_date)::int AS m
         FROM org_ledger_transactions t WHERE t.org_id = $1 AND t.status = 'posted' GROUP BY 1, 2`, [orgId]);
    const ledgerMonths = new Set(months.rows.map((r) => r.y * 100 + r.m));
    const imported = await pool.query(
      `SELECT period_year * 100 + period_month AS ym, COUNT(*)::int AS n
         FROM org_actuals WHERE org_id = $1 AND source IN ('xero', 'csv') GROUP BY 1`, [orgId]);
    let importedRows = 0, replacedRows = 0;
    for (const r of imported.rows) { importedRows += r.n; if (ledgerMonths.has(Number(r.ym))) replacedRows += r.n; }
    const ledgerRows = (await pool.query(
      `SELECT COUNT(*)::int AS n FROM org_actuals WHERE org_id = $1 AND source = 'ledger'`, [orgId])).rows[0].n;
    return {
      actuals_source: src, xero_connected: connected,
      imported_actuals_rows: importedRows, ledger_actuals_rows: ledgerRows,
      switch_to_ledger_replaces_imported_rows: replacedRows,
      switch_to_xero_removes_ledger_rows: ledgerRows,
    };
  }

  app.get('/api/organizational/orgs/:slug/actuals-source', ...member, async (req, res) => {
    try {
      return res.json(await currentState(req.orgId));
    } catch (e) {
      console.error('GET /actuals-source:', e.message);
      return res.status(500).json({ error: 'Could not load the data source setting' });
    }
  });

  app.put('/api/organizational/orgs/:slug/actuals-source', ...admin, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const next = String((req.body && req.body.actuals_source) || '');
    if (!SOURCES.includes(next)) return res.status(400).json({ error: 'actuals_source must be ledger or xero' });
    try {
      const before = await currentState(orgId);
      if (before.actuals_source === next) return res.json(before);
      await pool.query(
        `INSERT INTO org_settings (org_id, actuals_source) VALUES ($1, $2)
         ON CONFLICT (org_id) DO UPDATE SET actuals_source = EXCLUDED.actuals_source, updated_at = NOW()`,
        [orgId, next]);
      const after = await currentState(orgId);
      await logAudit(pool, {
        orgId, userId, action: 'update', tableName: 'org_settings', recordId: orgId,
        fields: diffFields({ actuals_source: before.actuals_source }, { actuals_source: after.actuals_source }, ['actuals_source']),
        metadata: reqMeta(req),
      });
      return res.json(after);
    } catch (e) {
      // A locked fiscal year blocks the regeneration of that year's actuals (trg_fy_lock_actuals).
      const locked = /locked/i.test(e.message || '');
      console.error('PUT /actuals-source:', e.message);
      return res.status(locked ? 409 : 500).json({
        error: locked ? 'A locked fiscal year blocks this change. Reopen the year first.' : 'Could not change the data source',
      });
    }
  });
}

module.exports = { registerActualsSourceRoutes };
