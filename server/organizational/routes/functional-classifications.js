'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');

function registerFunctionalClassificationRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const npAdmin = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireOrgRole('admin')];

  // GET — list all classifications for org + fiscal year, joined with account names
  app.get('/api/organizational/orgs/:slug/functional-classifications', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy     = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });

    try {
      const { rows } = await pool.query(
        `SELECT
           a.id           AS account_id,
           a.code,
           a.name,
           a.type,
           COALESCE(fc.program_services_bps, 0) AS program_services_bps,
           COALESCE(fc.mgmt_general_bps,     0) AS mgmt_general_bps,
           COALESCE(fc.fundraising_bps,       0) AS fundraising_bps,
           fc.notes,
           fc.updated_at
         FROM org_accounts a
         LEFT JOIN org_functional_classifications fc
           ON fc.account_id = a.id
          AND fc.org_id = $1
          AND fc.fiscal_year  = $2
         WHERE a.org_id = $1
           AND a.type = 'expense'
         ORDER BY a.code, a.name`,
        [orgId, fy]
      );
      res.json({ classifications: rows, fiscal_year: fy });
    } catch (e) {
      console.error('GET /functional-classifications:', e.message);
      res.status(500).json({ error: 'Could not load classifications' });
    }
  });

  // PUT — batch upsert classifications for a fiscal year
  app.put('/api/organizational/orgs/:slug/functional-classifications', ...npAdmin, async (req, res) => {
    const orgId = req.orgId;
    const { fiscal_year, rows: body } = req.body;

    const fy = Number.parseInt(String(fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });
    if (!Array.isArray(body) || !body.length) return res.status(400).json({ error: 'rows array required' });

    // Validate all rows sum to 10000 bps before touching the DB
    for (const r of body) {
      const ps = Number(r.program_services_bps ?? 0);
      const mg = Number(r.mgmt_general_bps     ?? 0);
      const fr = Number(r.fundraising_bps       ?? 0);
      if (!Number.isInteger(ps) || !Number.isInteger(mg) || !Number.isInteger(fr))
        return res.status(400).json({ error: 'Basis points must be integers' });
      if (ps + mg + fr !== 10000)
        return res.status(400).json({ error: `Allocations for account ${r.account_id} must sum to 100% (got ${ps + mg + fr} bps)` });
      if (ps < 0 || mg < 0 || fr < 0)
        return res.status(400).json({ error: 'Basis points cannot be negative' });
    }

    try {
      // Verify all account_ids belong to this org and are expense type
      const ids = body.map(r => Number(r.account_id)).filter(n => Number.isInteger(n));
      if (ids.length !== body.length) return res.status(400).json({ error: 'Invalid account_id in rows' });

      const acctCheck = await pool.query(
        `SELECT id FROM org_accounts WHERE id = ANY($1::int[]) AND org_id = $2 AND type = 'expense'`,
        [ids, orgId]
      );
      if (acctCheck.rowCount !== ids.length)
        return res.status(400).json({ error: 'One or more accounts not found or not expense type' });

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const r of body) {
          await client.query(
            `INSERT INTO org_functional_classifications
               (org_id, account_id, fiscal_year, program_services_bps, mgmt_general_bps, fundraising_bps, notes, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
             ON CONFLICT (org_id, account_id, fiscal_year)
             DO UPDATE SET
               program_services_bps = EXCLUDED.program_services_bps,
               mgmt_general_bps     = EXCLUDED.mgmt_general_bps,
               fundraising_bps      = EXCLUDED.fundraising_bps,
               notes                = EXCLUDED.notes,
               updated_at           = NOW()`,
            [orgId, Number(r.account_id), fy,
             Number(r.program_services_bps), Number(r.mgmt_general_bps), Number(r.fundraising_bps),
             r.notes || null]
          );
        }
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      res.json({ ok: true, saved: body.length });
    } catch (e) {
      console.error('PUT /functional-classifications:', e.message);
      res.status(500).json({ error: 'Could not save classifications' });
    }
  });

  // GET Part IX report — expense totals × functional allocation
  app.get('/api/organizational/orgs/:slug/reports/990-part-ix', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy     = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy)) return res.status(400).json({ error: 'fiscal_year required' });
    const fmt = String(req.query.format || 'json').toLowerCase();

    try {
      // Annual budgeted amount per expense account (sum all months)
      const { rows } = await pool.query(
        `SELECT
           a.id           AS account_id,
           a.code,
           a.name,
           COALESCE(SUM(bl.amount_cents), 0)::bigint       AS total_cents,
           COALESCE(fc.program_services_bps, 0)            AS program_services_bps,
           COALESCE(fc.mgmt_general_bps,     0)            AS mgmt_general_bps,
           COALESCE(fc.fundraising_bps,       0)           AS fundraising_bps
         FROM org_accounts a
         LEFT JOIN org_budget_lines bl
           ON bl.account_id = a.id
          AND bl.fiscal_year = $2
          AND bl.org_id = $1
         LEFT JOIN org_functional_classifications fc
           ON fc.account_id = a.id
          AND fc.org_id = $1
          AND fc.fiscal_year  = $2
         WHERE a.org_id = $1
           AND a.type = 'expense'
         GROUP BY a.id, a.code, a.name, fc.program_services_bps, fc.mgmt_general_bps, fc.fundraising_bps
         ORDER BY a.code, a.name`,
        [orgId, fy]
      );

      const lines = rows.map(r => {
        const total = Number(r.total_cents);
        const ps    = Math.round(total * Number(r.program_services_bps) / 10000);
        const mg    = Math.round(total * Number(r.mgmt_general_bps)     / 10000);
        const fr    = Math.round(total * Number(r.fundraising_bps)       / 10000);
        return {
          account_id:           r.account_id,
          code:                 r.code,
          name:                 r.name,
          total_cents:          total,
          program_services_bps: Number(r.program_services_bps),
          mgmt_general_bps:     Number(r.mgmt_general_bps),
          fundraising_bps:      Number(r.fundraising_bps),
          program_services_cents: ps,
          mgmt_general_cents:     mg,
          fundraising_cents:      fr,
        };
      });

      const totals = lines.reduce((acc, l) => {
        acc.total_cents              += l.total_cents;
        acc.program_services_cents   += l.program_services_cents;
        acc.mgmt_general_cents       += l.mgmt_general_cents;
        acc.fundraising_cents        += l.fundraising_cents;
        return acc;
      }, { total_cents: 0, program_services_cents: 0, mgmt_general_cents: 0, fundraising_cents: 0 });

      if (fmt === 'csv') {
        const csvRows = [
          ['Account Code', 'Account Name', 'Total ($)', 'Program Services ($)', 'Mgmt & General ($)', 'Fundraising ($)', 'Unclassified (bps sum ≠ 10000)'].join(','),
          ...lines.map(l => {
            const unclassified = (l.program_services_bps + l.mgmt_general_bps + l.fundraising_bps) !== 10000 ? 'YES' : '';
            return [
              l.code || '',
              '"' + (l.name || '').replace(/"/g, '""') + '"',
              (l.total_cents / 100).toFixed(2),
              (l.program_services_cents / 100).toFixed(2),
              (l.mgmt_general_cents / 100).toFixed(2),
              (l.fundraising_cents / 100).toFixed(2),
              unclassified,
            ].join(',');
          }),
          ['TOTAL', '', (totals.total_cents / 100).toFixed(2),
           (totals.program_services_cents / 100).toFixed(2),
           (totals.mgmt_general_cents / 100).toFixed(2),
           (totals.fundraising_cents / 100).toFixed(2), ''].join(','),
        ].join('\r\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="990-part-ix-${fy}.csv"`);
        return res.send(csvRows);
      }

      res.json({ lines, totals, fiscal_year: fy });
    } catch (e) {
      console.error('GET /reports/990-part-ix:', e.message);
      res.status(500).json({ error: 'Could not generate Part IX report' });
    }
  });
}

module.exports = { registerFunctionalClassificationRoutes };
