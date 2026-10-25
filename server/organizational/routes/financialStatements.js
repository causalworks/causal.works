'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireReportsOrBoard, boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { buildFinancialPosition } = require('../lib/financialPositionStatement');
const { buildStatementOfActivities } = require('../lib/statementOfActivities');
const { buildCashFlows } = require('../lib/cashFlowStatement');
const { buildFunctionalExpenses } = require('../lib/functionalExpensesStatement');
const { netAssetsDetail } = require('../lib/netAssetsDetail');
const { StatementIntegrityError } = require('../lib/statementTree');
const { csvCell } = require('../lib/csvCell');
const { fyDateRange, getFiscalYearEndMonth } = require('../lib/fiscalYear');

function registerFinancialStatementRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // ── Shared helpers ─────────────────────────────────────────────────────────

  async function checkActualsSource(orgId) {
    const r = await pool.query(
      'SELECT actuals_source FROM org_settings WHERE org_id = $1',
      [orgId]
    );
    return r.rows[0] ? r.rows[0].actuals_source : 'ledger';
  }

  const fmtCsv = csvCell;

  // ── Statement of Financial Position ───────────────────────────────────────
  app.get('/api/organizational/orgs/:slug/reports/financial-position', ...orgAuth, requireReportsOrBoard(pool), boardSeesAllPrograms, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year required' });
    }

    try {
      const actualsSource = await checkActualsSource(orgId);
      if (actualsSource !== 'ledger') {
        return res.json({ not_available: true, reason: 'xero', fiscal_year: fy });
      }

      const st = await buildFinancialPosition(pool, orgId, fy);

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Section', 'Code', 'Account', 'Balance ($)'].join(','),
          ...st.rows.filter((r) => r.amount_cents != null).map((r) =>
            [fmtCsv(r.kind === 'line' ? '' : r.kind === 'grand' ? 'Total' : 'Subtotal'), fmtCsv(r.code || ''), fmtCsv(r.label), (r.amount_cents / 100).toFixed(2)].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="financial-position-${fy}.csv"`);
        return res.send(rows);
      }

      const fyRange = fyDateRange(fy, await getFiscalYearEndMonth(pool, orgId));
      res.json({
        fiscal_year: fy,
        start_date: fyRange.startDate,
        end_date: fyRange.endDate,
        rows: st.rows,
        warnings: st.warnings,
        total_assets_cents: st.totals.assets,
        total_liabilities_cents: st.totals.liabilities,
        net_assets: {
          without_restrictions_cents: st.net_assets.without_restrictions,
          board_designated_cents: st.net_assets.board_designated,
          undesignated_cents: st.net_assets.undesignated,
          with_restrictions_cents: st.net_assets.with_restrictions,
          total_cents: st.totals.net_assets,
        },
        restriction_detail: {
          temporarily_restricted_cents: st.restriction_detail.temporarily_restricted,
          permanently_restricted_cents: st.restriction_detail.permanently_restricted,
        },
        total_liabilities_and_net_assets_cents: st.totals.liabilities_and_net_assets,
      });
    } catch (e) {
      console.error('GET /reports/financial-position:', e.message);
      if (e instanceof StatementIntegrityError) {
        return res.status(500).json({ error: 'This statement did not pass its own checks and was not produced.', failures: e.failures.map((f) => f.message) });
      }
      res.status(500).json({ error: 'Could not compute Statement of Financial Position' });
    }
  });

  // ── Net assets detail: the entries behind a net assets amount ─────────────
  app.get('/api/organizational/orgs/:slug/reports/net-assets-detail', ...orgAuth, requireReportsOrBoard(pool), boardSeesAllPrograms, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) return res.status(400).json({ error: 'fiscal_year required' });
    const bucket = req.query.bucket === 'with' ? 'with' : 'without';
    const designation = /^\d+$/.test(String(req.query.designation || '')) ? String(req.query.designation) : (req.query.designation === 'none' ? 'none' : 'all');
    try {
      const d = await netAssetsDetail(pool, orgId, fy, bucket, designation);
      if (!d.ties) {
        return res.status(500).json({ error: 'This detail did not match the statement amount and was not produced.', failures: [`Entries add to ${d.total_cents} but the statement shows ${d.expected_cents}`] });
      }
      if (String(req.query.format || '') === 'csv') {
        const rows = [
          ['Date', 'Account', 'Memo', 'Restriction', 'Amount ($)'].join(','),
          ...d.lines.map((l) => [fmtCsv(String(l.transaction_date).slice(0, 10)), fmtCsv((l.code ? l.code + ' ' : '') + l.account_name), fmtCsv(l.memo || ''), fmtCsv(l.restriction_class), (l.amount_cents / 100).toFixed(2)].join(',')),
          ['', 'Total', '', '', (d.total_cents / 100).toFixed(2)].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="net-assets-detail-${fy}.csv"`);
        return res.send(rows);
      }
      const fyRange = fyDateRange(fy, await getFiscalYearEndMonth(pool, orgId));
      return res.json({ fiscal_year: fy, end_date: fyRange.endDate, bucket, designation, ...d });
    } catch (e) {
      console.error('GET /reports/net-assets-detail:', e.message);
      return res.status(500).json({ error: 'Could not load the net assets detail' });
    }
  });

  // ── Statement of Activities ────────────────────────────────────────────────
  app.get('/api/organizational/orgs/:slug/reports/statement-of-activities', ...orgAuth, requireReportsOrBoard(pool), boardSeesAllPrograms, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year required' });
    }

    try {
      const actualsSource = await checkActualsSource(orgId);
      if (actualsSource !== 'ledger') {
        return res.json({ not_available: true, reason: 'xero', fiscal_year: fy });
      }

      const st = await buildStatementOfActivities(pool, orgId, fy);

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const money = (c) => (c / 100).toFixed(2);
        const rows = [
          ['Code', 'Line', 'Without Donor Restrictions ($)', 'With Donor Restrictions ($)', 'Total ($)'].join(','),
          ...st.rows.filter((r) => r.amount_cents != null).map((r) =>
            [fmtCsv(r.code || ''), fmtCsv(r.label), money(r.without_cents), money(r.with_cents), money(r.amount_cents)].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="statement-of-activities-${fy}.csv"`);
        return res.send(rows);
      }

      const fyRange = fyDateRange(fy, await getFiscalYearEndMonth(pool, orgId));
      res.json({
        fiscal_year: fy,
        start_date: fyRange.startDate,
        end_date: fyRange.endDate,
        rows: st.rows,
        warnings: st.warnings,
        totals: st.totals,
        net_assets: st.net_assets,
      });
    } catch (e) {
      console.error('GET /reports/statement-of-activities:', e.message);
      if (e instanceof StatementIntegrityError) {
        return res.status(500).json({ error: 'This statement did not pass its own checks and was not produced.', failures: e.failures.map((f) => f.message) });
      }
      res.status(500).json({ error: 'Could not compute Statement of Activities' });
    }
  });

  // ── Statement of Functional Expenses ──────────────────────────────────────
  app.get('/api/organizational/orgs/:slug/reports/functional-expenses', ...orgAuth, requireReportsOrBoard(pool), boardSeesAllPrograms, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year required' });
    }

    try {
      const actualsSource = await checkActualsSource(orgId);
      if (actualsSource !== 'ledger') {
        return res.json({ not_available: true, reason: 'xero', fiscal_year: fy });
      }

      const st = await buildFunctionalExpenses(pool, orgId, fy);

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const money = (c) => (c / 100).toFixed(2);
        const rows = [
          ['Code', 'Account', 'Total ($)', 'Program Services ($)', 'Mgmt & General ($)', 'Fundraising ($)', 'Note'].join(','),
          ...st.rows.filter((r) => r.kind !== 'header').map((r) => [
            fmtCsv(r.code || ''), fmtCsv(r.label), money(r.total_cents), money(r.program_services_cents), money(r.mgmt_general_cents), money(r.fundraising_cents),
            r.missing_classification ? fmtCsv('no allocation set') : '',
          ].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="functional-expenses-${fy}.csv"`);
        return res.send(rows);
      }

      const fyRange = fyDateRange(fy, await getFiscalYearEndMonth(pool, orgId));
      res.json({ fiscal_year: fy, start_date: fyRange.startDate, end_date: fyRange.endDate, rows: st.rows, warnings: st.warnings });
    } catch (e) {
      console.error('GET /reports/functional-expenses:', e.message);
      if (e instanceof StatementIntegrityError) {
        return res.status(500).json({ error: 'This statement did not pass its own checks and was not produced.', failures: e.failures.map((f) => f.message) });
      }
      res.status(500).json({ error: 'Could not compute Statement of Functional Expenses' });
    }
  });

  // ── Statement of Cash Flows (Indirect Method) ─────────────────────────────
  app.get('/api/organizational/orgs/:slug/reports/cash-flows', ...orgAuth, requireReportsOrBoard(pool), boardSeesAllPrograms, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    if (!fy || !Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).json({ error: 'fiscal_year required' });
    }

    try {
      const actualsSource = await checkActualsSource(orgId);
      if (actualsSource !== 'ledger') {
        return res.json({ not_available: true, reason: 'xero', fiscal_year: fy });
      }

      const st = await buildCashFlows(pool, orgId, fy);

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Line', 'Amount ($)'].join(','),
          ...st.rows.filter((r) => r.amount_cents != null).map((r) => [fmtCsv(r.label), (r.amount_cents / 100).toFixed(2)].join(',')),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="cash-flows-${fy}.csv"`);
        return res.send(rows);
      }

      const fyRange = fyDateRange(fy, await getFiscalYearEndMonth(pool, orgId));
      res.json({
        fiscal_year: fy,
        start_date: fyRange.startDate,
        end_date: fyRange.endDate,
        rows: st.rows,
        warnings: st.warnings,
        net_change_in_cash_cents: st.net_change_cents,
        beginning_cash_cents: st.beginning_cash_cents,
        ending_cash_cents: st.ending_cash_cents,
      });
    } catch (e) {
      console.error('GET /reports/cash-flows:', e.message);
      if (e instanceof StatementIntegrityError) {
        return res.status(500).json({ error: 'This statement did not pass its own checks and was not produced.', failures: e.failures.map((f) => f.message) });
      }
      res.status(500).json({ error: 'Could not compute Statement of Cash Flows' });
    }
  });
}

module.exports = { registerFinancialStatementRoutes };
