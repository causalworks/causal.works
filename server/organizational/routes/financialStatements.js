'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');

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

  function fmtCsv(value) {
    return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"';
  }

  // ── Statement of Financial Position ───────────────────────────────────────
  // GET /api/organizational/orgs/:slug/reports/financial-position
  // Query: fiscal_year, format (json|csv)
  //
  // Live-computed from posted ledger lines for all fiscal_year <= requested FY.
  // Only available for actuals_source = 'ledger' orgs.
  app.get('/api/organizational/orgs/:slug/reports/financial-position', ...orgAuth, async (req, res) => {
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

      // Assets: debit-normal; cumulative through fiscal_year = fy
      const assetsRes = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name, a.type,
           SUM(l.debit_cents - l.credit_cents) AS balance_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
           AND a.type = 'asset' AND a.is_posting = true
         GROUP BY a.id, a.code, a.name, a.type
         HAVING SUM(l.debit_cents - l.credit_cents) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );

      // Liabilities: credit-normal; cumulative
      const liabRes = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name, a.type,
           SUM(l.credit_cents - l.debit_cents) AS balance_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
           AND a.type = 'liability' AND a.is_posting = true
         GROUP BY a.id, a.code, a.name, a.type
         HAVING SUM(l.credit_cents - l.debit_cents) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );

      // Net assets by restriction class (computed from income, expense, equity flows)
      // Income: credit-normal, expense: debit-normal but credit-debit is negative → subtracts from net assets
      // This correctly yields: unrestricted revenue - expenses + equity activity
      const netAssetsRes = await pool.query(
        `SELECT
           CASE WHEN l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')
                THEN 'with_restrictions'
                ELSE 'without_restrictions'
           END AS restriction_bucket,
           SUM(l.credit_cents - l.debit_cents) AS net_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
           AND a.type IN ('income', 'expense', 'equity') AND a.is_posting = true
         GROUP BY restriction_bucket`,
        [orgId, fy]
      );

      // Footnote: temp/perm split for disclosure
      const restrictionDetailRes = await pool.query(
        `SELECT
           l.donor_restriction_class,
           SUM(l.credit_cents - l.debit_cents) AS net_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
           AND a.type IN ('income', 'expense', 'equity') AND a.is_posting = true
           AND l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')
         GROUP BY l.donor_restriction_class`,
        [orgId, fy]
      );

      // Board-designated sub-line, additive disclosure only (ASU 2016-14 liquidity/appropriation
      // disclosure) -- does not change without_restrictions_cents above, which already includes
      // this activity (board designations move dollars within without-donor-restriction net
      // assets, they don't create a new GAAP net-asset class). See migration 237.
      const boardDesignatedRes = await pool.query(
        `SELECT COALESCE(SUM(l.credit_cents - l.debit_cents), 0) AS balance_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year <= $2
           AND l.board_designation_id IS NOT NULL`,
        [orgId, fy]
      );
      const boardDesignatedCents = Number(boardDesignatedRes.rows[0].balance_cents);

      const assets = assetsRes.rows;
      const liabilities = liabRes.rows;
      const totalAssets = assets.reduce((s, r) => s + Number(r.balance_cents), 0);
      const totalLiabilities = liabilities.reduce((s, r) => s + Number(r.balance_cents), 0);

      const netAssetBuckets = { without_restrictions: 0, with_restrictions: 0 };
      for (const r of netAssetsRes.rows) {
        netAssetBuckets[r.restriction_bucket] = Number(r.net_cents);
      }
      const totalNetAssets = netAssetBuckets.without_restrictions + netAssetBuckets.with_restrictions;

      const restrictionDetail = {};
      for (const r of restrictionDetailRes.rows) {
        restrictionDetail[r.donor_restriction_class] = Number(r.net_cents);
      }

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Section', 'Code', 'Account', 'Balance ($)'].join(','),
          ...assets.map(r => [fmtCsv('Assets'), fmtCsv(r.code), fmtCsv(r.name), (Number(r.balance_cents) / 100).toFixed(2)].join(',')),
          ['Total Assets', '', '', (totalAssets / 100).toFixed(2)].join(','),
          ...liabilities.map(r => [fmtCsv('Liabilities'), fmtCsv(r.code), fmtCsv(r.name), (Number(r.balance_cents) / 100).toFixed(2)].join(',')),
          ['Total Liabilities', '', '', (totalLiabilities / 100).toFixed(2)].join(','),
          ['Net Assets - Without donor restrictions', '', '', (netAssetBuckets.without_restrictions / 100).toFixed(2)].join(','),
          ['  of which: board-designated', '', '', (boardDesignatedCents / 100).toFixed(2)].join(','),
          ['Net Assets - With donor restrictions', '', '', (netAssetBuckets.with_restrictions / 100).toFixed(2)].join(','),
          ['Total Net Assets', '', '', (totalNetAssets / 100).toFixed(2)].join(','),
          ['Total Liabilities and Net Assets', '', '', ((totalLiabilities + totalNetAssets) / 100).toFixed(2)].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="financial-position-${fy}.csv"`);
        return res.send(rows);
      }

      res.json({
        fiscal_year: fy,
        assets,
        liabilities,
        total_assets_cents: totalAssets,
        total_liabilities_cents: totalLiabilities,
        net_assets: {
          without_restrictions_cents: netAssetBuckets.without_restrictions,
          board_designated_cents: boardDesignatedCents,
          with_restrictions_cents: netAssetBuckets.with_restrictions,
          total_cents: totalNetAssets,
        },
        restriction_detail: {
          temporarily_restricted_cents: restrictionDetail.temporarily_restricted || 0,
          permanently_restricted_cents: restrictionDetail.permanently_restricted || 0,
        },
        total_liabilities_and_net_assets_cents: totalLiabilities + totalNetAssets,
      });
    } catch (e) {
      console.error('GET /reports/financial-position:', e.message);
      res.status(500).json({ error: 'Could not compute Statement of Financial Position' });
    }
  });

  // ── Statement of Activities ────────────────────────────────────────────────
  // GET /api/organizational/orgs/:slug/reports/statement-of-activities
  // Query: fiscal_year, format (json|csv)
  app.get('/api/organizational/orgs/:slug/reports/statement-of-activities', ...orgAuth, async (req, res) => {
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

      // Revenue by account and restriction class
      const revenueRes = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name,
           CASE WHEN l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')
                THEN 'with_restrictions'
                ELSE 'without_restrictions'
           END AS restriction_bucket,
           SUM(l.credit_cents - l.debit_cents) AS amount_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
           AND a.type = 'income' AND a.is_posting = true
         GROUP BY a.id, a.code, a.name, restriction_bucket
         HAVING SUM(l.credit_cents - l.debit_cents) <> 0
         ORDER BY a.code, restriction_bucket`,
        [orgId, fy]
      );

      // Expenses by account (functional split via functional_classifications).
      // Also grouped by restriction bucket: a ledger line inherits its donor_restriction_class
      // from its grant when spent against a restricted grant (see ledgerPosting.js), so an
      // expense CAN carry a restricted tag -- that amount is what gets "released" below.
      const expensesRes = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name,
           SUM(l.debit_cents - l.credit_cents) AS amount_cents,
           SUM(CASE WHEN l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')
                    THEN l.debit_cents - l.credit_cents ELSE 0 END) AS restricted_amount_cents,
           COALESCE(MAX(fc.program_services_bps), 0) AS program_services_bps,
           COALESCE(MAX(fc.mgmt_general_bps), 0) AS mgmt_general_bps,
           COALESCE(MAX(fc.fundraising_bps), 0) AS fundraising_bps,
           BOOL_OR(fc.id IS NULL) AS missing_classification
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         LEFT JOIN org_functional_classifications fc
           ON fc.account_id = a.id AND fc.org_id = t.org_id AND fc.fiscal_year = t.fiscal_year
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
           AND a.type = 'expense' AND a.is_posting = true
         GROUP BY a.id, a.code, a.name
         HAVING SUM(l.debit_cents - l.credit_cents) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );

      // Beginning net assets (all years < fy)
      const beginNetRes = await pool.query(
        `SELECT
           CASE WHEN l.donor_restriction_class IN ('temporarily_restricted', 'permanently_restricted')
                THEN 'with_restrictions'
                ELSE 'without_restrictions'
           END AS restriction_bucket,
           SUM(l.credit_cents - l.debit_cents) AS net_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year < $2
           AND a.type IN ('income', 'expense', 'equity') AND a.is_posting = true
         GROUP BY restriction_bucket`,
        [orgId, fy]
      );

      const revenue = revenueRes.rows;
      const expenses = expensesRes.rows;

      const totalRevenueWithout = revenue
        .filter(r => r.restriction_bucket === 'without_restrictions')
        .reduce((s, r) => s + Number(r.amount_cents), 0);
      const totalRevenueWith = revenue
        .filter(r => r.restriction_bucket === 'with_restrictions')
        .reduce((s, r) => s + Number(r.amount_cents), 0);
      const totalExpenses = expenses.reduce((s, r) => s + Number(r.amount_cents), 0);
      // Net assets released from restrictions: the portion of this period's expenses paid
      // for with restricted-grant funds. GAAP presentation always shows total expenses in the
      // "without donor restrictions" column, offset by this release from the "with
      // restrictions" column -- the net effect on each bucket is identical to netting each
      // expense line directly against its own restriction tag (what Financial Position does),
      // so this stays reconciled with Financial Position's net assets by construction.
      const releasedFromRestrictions = expenses.reduce((s, r) => s + Number(r.restricted_amount_cents), 0);

      const changeWithout = totalRevenueWithout + releasedFromRestrictions - totalExpenses;
      const changeWith = totalRevenueWith - releasedFromRestrictions;
      const totalChange = changeWithout + changeWith;

      const beginBuckets = { without_restrictions: 0, with_restrictions: 0 };
      for (const r of beginNetRes.rows) {
        beginBuckets[r.restriction_bucket] = Number(r.net_cents);
      }
      const beginTotal = beginBuckets.without_restrictions + beginBuckets.with_restrictions;

      const endWithout = beginBuckets.without_restrictions + changeWithout;
      const endWith = beginBuckets.with_restrictions + changeWith;
      const endTotal = beginTotal + totalChange;

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Section', 'Code', 'Account', 'Without Donor Restrictions ($)', 'With Donor Restrictions ($)', 'Total ($)'].join(','),
          ...revenue.filter(r => r.restriction_bucket === 'without_restrictions').map(r =>
            [fmtCsv('Revenue'), fmtCsv(r.code), fmtCsv(r.name), (Number(r.amount_cents)/100).toFixed(2), '', ''].join(',')),
          ...revenue.filter(r => r.restriction_bucket === 'with_restrictions').map(r =>
            [fmtCsv('Revenue'), fmtCsv(r.code), fmtCsv(r.name), '', (Number(r.amount_cents)/100).toFixed(2), ''].join(',')),
          ['Total Revenue', '', '', (totalRevenueWithout/100).toFixed(2), (totalRevenueWith/100).toFixed(2), ((totalRevenueWithout+totalRevenueWith)/100).toFixed(2)].join(','),
          ...expenses.map(r =>
            [fmtCsv('Expenses'), fmtCsv(r.code), fmtCsv(r.name), (Number(r.amount_cents)/100).toFixed(2), '', ''].join(',')),
          ['Total Expenses', '', '', (totalExpenses/100).toFixed(2), '', (totalExpenses/100).toFixed(2)].join(','),
          ['Net Assets Released from Restrictions', '', '', (releasedFromRestrictions/100).toFixed(2), (-releasedFromRestrictions/100).toFixed(2), '0.00'].join(','),
          ['Change in Net Assets', '', '', (changeWithout/100).toFixed(2), (changeWith/100).toFixed(2), (totalChange/100).toFixed(2)].join(','),
          ['Beginning Net Assets', '', '', (beginBuckets.without_restrictions/100).toFixed(2), (beginBuckets.with_restrictions/100).toFixed(2), (beginTotal/100).toFixed(2)].join(','),
          ['Ending Net Assets', '', '', (endWithout/100).toFixed(2), (endWith/100).toFixed(2), (endTotal/100).toFixed(2)].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="statement-of-activities-${fy}.csv"`);
        return res.send(rows);
      }

      res.json({
        fiscal_year: fy,
        revenue,
        expenses,
        totals: {
          revenue_without_restrictions_cents: totalRevenueWithout,
          revenue_with_restrictions_cents: totalRevenueWith,
          total_revenue_cents: totalRevenueWithout + totalRevenueWith,
          total_expenses_cents: totalExpenses,
          released_from_restrictions_cents: releasedFromRestrictions,
          change_without_restrictions_cents: changeWithout,
          change_with_restrictions_cents: changeWith,
          total_change_in_net_assets_cents: totalChange,
        },
        net_assets: {
          beginning: {
            without_restrictions_cents: beginBuckets.without_restrictions,
            with_restrictions_cents: beginBuckets.with_restrictions,
            total_cents: beginTotal,
          },
          ending: {
            without_restrictions_cents: endWithout,
            with_restrictions_cents: endWith,
            total_cents: endTotal,
          },
        },
      });
    } catch (e) {
      console.error('GET /reports/statement-of-activities:', e.message);
      res.status(500).json({ error: 'Could not compute Statement of Activities' });
    }
  });

  // ── Statement of Functional Expenses ──────────────────────────────────────
  // GET /api/organizational/orgs/:slug/reports/functional-expenses
  // Query: fiscal_year, format (json|csv)
  app.get('/api/organizational/orgs/:slug/reports/functional-expenses', ...orgAuth, async (req, res) => {
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

      const res2 = await pool.query(
        `SELECT a.id AS account_id, a.code, a.name,
           SUM(l.debit_cents - l.credit_cents) AS total_cents,
           COALESCE(MAX(fc.program_services_bps), 0) AS program_services_bps,
           COALESCE(MAX(fc.mgmt_general_bps), 0) AS mgmt_general_bps,
           COALESCE(MAX(fc.fundraising_bps), 0) AS fundraising_bps,
           BOOL_OR(fc.id IS NULL) AS missing_classification
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         LEFT JOIN org_functional_classifications fc
           ON fc.account_id = a.id AND fc.org_id = t.org_id AND fc.fiscal_year = t.fiscal_year
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
           AND a.type = 'expense' AND a.is_posting = true
         GROUP BY a.id, a.code, a.name
         HAVING SUM(l.debit_cents - l.credit_cents) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );

      const lines = res2.rows.map(r => {
        const total = Number(r.total_cents);
        const progBps = Number(r.program_services_bps);
        const mgmtBps = Number(r.mgmt_general_bps);
        const fundBps = Number(r.fundraising_bps);
        // Use integer math to avoid floating-point drift; remainder goes to program services
        const mgmt = Math.round(total * mgmtBps / 10000);
        const fund = Math.round(total * fundBps / 10000);
        const prog = total - mgmt - fund;
        return {
          account_id: r.account_id,
          code: r.code,
          name: r.name,
          total_cents: total,
          program_services_cents: prog,
          mgmt_general_cents: mgmt,
          fundraising_cents: fund,
          program_services_bps: progBps,
          mgmt_general_bps: mgmtBps,
          fundraising_bps: fundBps,
          missing_classification: r.missing_classification,
        };
      });

      const totals = lines.reduce((acc, l) => {
        acc.total_cents += l.total_cents;
        acc.program_services_cents += l.program_services_cents;
        acc.mgmt_general_cents += l.mgmt_general_cents;
        acc.fundraising_cents += l.fundraising_cents;
        return acc;
      }, { total_cents: 0, program_services_cents: 0, mgmt_general_cents: 0, fundraising_cents: 0 });

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Code', 'Account', 'Total ($)', 'Program Services ($)', 'Mgmt & General ($)', 'Fundraising ($)', 'Note'].join(','),
          ...lines.map(l => [
            fmtCsv(l.code), fmtCsv(l.name),
            (l.total_cents / 100).toFixed(2),
            (l.program_services_cents / 100).toFixed(2),
            (l.mgmt_general_cents / 100).toFixed(2),
            (l.fundraising_cents / 100).toFixed(2),
            l.missing_classification ? fmtCsv('⚠ no allocation set') : '',
          ].join(',')),
          ['Total', '', (totals.total_cents / 100).toFixed(2), (totals.program_services_cents / 100).toFixed(2), (totals.mgmt_general_cents / 100).toFixed(2), (totals.fundraising_cents / 100).toFixed(2), ''].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="functional-expenses-${fy}.csv"`);
        return res.send(rows);
      }

      res.json({ fiscal_year: fy, lines, totals });
    } catch (e) {
      console.error('GET /reports/functional-expenses:', e.message);
      res.status(500).json({ error: 'Could not compute Statement of Functional Expenses' });
    }
  });

  // ── Statement of Cash Flows (Indirect Method) ─────────────────────────────
  // GET /api/organizational/orgs/:slug/reports/cash-flows
  // Query: fiscal_year, format (json|csv)
  //
  // Indirect method: starts from change in net assets, adjusts for non-cash
  // items and changes in working capital. Investing = net change in non-cash
  // fixed assets. Financing = equity account postings (rare for nonprofits).
  app.get('/api/organizational/orgs/:slug/reports/cash-flows', ...orgAuth, async (req, res) => {
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

      // Change in net assets for the period (basis for indirect method)
      const changeNetAssetsRes = await pool.query(
        `SELECT SUM(l.credit_cents - l.debit_cents) AS change_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
           AND a.type IN ('income', 'expense') AND a.is_posting = true`,
        [orgId, fy]
      );
      const changeNetAssets = Number(changeNetAssetsRes.rows[0]?.change_cents || 0);

      // Non-cash expense adjustments: expense accounts explicitly flagged is_non_cash
      // (depreciation, amortization, in-kind/donated-services expense, etc.)
      const nonCashExpenseRes = await pool.query(
        `SELECT a.code, a.name,
           SUM(l.debit_cents - l.credit_cents) AS amount_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND t.fiscal_year = $2
           AND a.type = 'expense' AND a.is_posting = true AND a.is_non_cash = true
         GROUP BY a.code, a.name
         HAVING SUM(l.debit_cents - l.credit_cents) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );
      const nonCashExpenses = nonCashExpenseRes.rows;
      const totalNonCash = nonCashExpenses.reduce((s, r) => s + Number(r.amount_cents), 0);

      // Changes in operating assets (non-cash): receivables, prepaid, etc.
      // Increase in asset = use of cash (negative); decrease = source of cash (positive)
      // Change = ending balance - beginning balance; for operating, flip sign (increase hurts cash)
      const opAssetsRes = await pool.query(
        `SELECT a.code, a.name,
           SUM(CASE WHEN t.fiscal_year = $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) AS current_fy_net,
           SUM(CASE WHEN t.fiscal_year < $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) AS prior_cumulative
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted'
           AND a.type = 'asset' AND a.is_posting = true
           AND a.is_cash_account = false
           AND COALESCE(a.standard_category, '') NOT IN ('fixed_asset', 'accumulated_depreciation') -- NULL category (unset) must not drop the account
         GROUP BY a.code, a.name
         HAVING SUM(CASE WHEN t.fiscal_year = $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );
      // Change in operating asset = current_fy_net (net debit-credit for the year only)
      // Increase in asset (positive net) = cash used (negative for cash flow)
      const opAssetChanges = opAssetsRes.rows.map(r => ({
        code: r.code,
        name: r.name,
        change_cents: Number(r.current_fy_net),    // raw balance change this FY
        cash_impact_cents: -Number(r.current_fy_net), // flip: asset increase = cash decrease
      })).filter(r => r.change_cents !== 0);

      // Changes in operating liabilities (AP, accrued): increase = source of cash
      const opLiabRes = await pool.query(
        `SELECT a.code, a.name,
           SUM(CASE WHEN t.fiscal_year = $2 THEN l.credit_cents - l.debit_cents ELSE 0 END) AS current_fy_net
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted'
           AND a.type = 'liability' AND a.is_posting = true
         GROUP BY a.code, a.name
         HAVING SUM(CASE WHEN t.fiscal_year = $2 THEN l.credit_cents - l.debit_cents ELSE 0 END) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );
      // Increase in liability = cash source (positive)
      const opLiabChanges = opLiabRes.rows.map(r => ({
        code: r.code,
        name: r.name,
        change_cents: Number(r.current_fy_net),
        cash_impact_cents: Number(r.current_fy_net),
      })).filter(r => r.change_cents !== 0);

      const totalOpAssetAdj = opAssetChanges.reduce((s, r) => s + r.cash_impact_cents, 0);
      const totalOpLiabAdj = opLiabChanges.reduce((s, r) => s + r.cash_impact_cents, 0);

      const netOperating = changeNetAssets + totalNonCash + totalOpAssetAdj + totalOpLiabAdj;

      // Investing activities: net change in fixed assets and accumulated depreciation
      const investingRes = await pool.query(
        `SELECT a.code, a.name,
           SUM(CASE WHEN t.fiscal_year = $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) AS current_fy_net
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted'
           AND a.type = 'asset' AND a.is_posting = true
           AND a.standard_category IN ('fixed_asset', 'accumulated_depreciation')
         GROUP BY a.code, a.name
         HAVING SUM(CASE WHEN t.fiscal_year = $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );
      const investingItems = investingRes.rows.map(r => ({
        code: r.code,
        name: r.name,
        change_cents: Number(r.current_fy_net),
        cash_impact_cents: -Number(r.current_fy_net), // increase in fixed asset = cash used
      })).filter(r => r.change_cents !== 0);

      const netInvesting = investingItems.reduce((s, r) => s + r.cash_impact_cents, 0);

      // Financing activities: equity account postings (owner contributions, endowment draws, etc.)
      const financingRes = await pool.query(
        `SELECT a.code, a.name,
           SUM(CASE WHEN t.fiscal_year = $2 THEN l.credit_cents - l.debit_cents ELSE 0 END) AS current_fy_net
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted'
           AND a.type = 'equity' AND a.is_posting = true
         GROUP BY a.code, a.name
         HAVING SUM(CASE WHEN t.fiscal_year = $2 THEN l.credit_cents - l.debit_cents ELSE 0 END) <> 0
         ORDER BY a.code`,
        [orgId, fy]
      );
      const financingItems = financingRes.rows.map(r => ({
        code: r.code,
        name: r.name,
        change_cents: Number(r.current_fy_net),
        cash_impact_cents: Number(r.current_fy_net),
      })).filter(r => r.change_cents !== 0);
      const netFinancing = financingItems.reduce((s, r) => s + r.cash_impact_cents, 0);

      // Net change in cash = operating + investing + financing
      const netChangeCash = netOperating + netInvesting + netFinancing;

      // Beginning and ending cash balances
      const cashRes = await pool.query(
        `SELECT
           SUM(CASE WHEN t.fiscal_year < $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) AS beginning_cents,
           SUM(CASE WHEN t.fiscal_year <= $2 THEN l.debit_cents - l.credit_cents ELSE 0 END) AS ending_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts a ON a.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted'
           AND a.type = 'asset' AND a.is_cash_account = true`,
        [orgId, fy]
      );
      const beginCash = Number(cashRes.rows[0]?.beginning_cents || 0);
      const endCash = Number(cashRes.rows[0]?.ending_cents || 0);

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const rows = [
          ['Section', 'Account', 'Amount ($)'].join(','),
          ['Operating Activities', 'Change in net assets', (changeNetAssets / 100).toFixed(2)].join(','),
          ...nonCashExpenses.map(r => ['Operating Activities', fmtCsv('Add: ' + r.name + ' (non-cash)'), (Number(r.amount_cents) / 100).toFixed(2)].join(',')),
          ...opAssetChanges.map(r => ['Operating Activities', fmtCsv('(Increase)/decrease in ' + r.name), (r.cash_impact_cents / 100).toFixed(2)].join(',')),
          ...opLiabChanges.map(r => ['Operating Activities', fmtCsv('Increase/(decrease) in ' + r.name), (r.cash_impact_cents / 100).toFixed(2)].join(',')),
          ['Operating Activities', 'Net cash from operating activities', (netOperating / 100).toFixed(2)].join(','),
          ...investingItems.map(r => ['Investing Activities', fmtCsv(r.name), (r.cash_impact_cents / 100).toFixed(2)].join(',')),
          ['Investing Activities', 'Net cash from investing activities', (netInvesting / 100).toFixed(2)].join(','),
          ...financingItems.map(r => ['Financing Activities', fmtCsv(r.name), (r.cash_impact_cents / 100).toFixed(2)].join(',')),
          ['Financing Activities', 'Net cash from financing activities', (netFinancing / 100).toFixed(2)].join(','),
          ['', 'Net change in cash', (netChangeCash / 100).toFixed(2)].join(','),
          ['', 'Beginning cash and cash equivalents', (beginCash / 100).toFixed(2)].join(','),
          ['', 'Ending cash and cash equivalents', (endCash / 100).toFixed(2)].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="cash-flows-${fy}.csv"`);
        return res.send(rows);
      }

      res.json({
        fiscal_year: fy,
        operating: {
          change_in_net_assets_cents: changeNetAssets,
          non_cash_adjustments: nonCashExpenses.map(r => ({ code: r.code, name: r.name, amount_cents: Number(r.amount_cents) })),
          operating_asset_changes: opAssetChanges,
          operating_liability_changes: opLiabChanges,
          net_operating_cents: netOperating,
        },
        investing: {
          items: investingItems,
          net_investing_cents: netInvesting,
        },
        financing: {
          items: financingItems,
          net_financing_cents: netFinancing,
        },
        net_change_in_cash_cents: netChangeCash,
        beginning_cash_cents: beginCash,
        ending_cash_cents: endCash,
      });
    } catch (e) {
      console.error('GET /reports/cash-flows:', e.message);
      res.status(500).json({ error: 'Could not compute Statement of Cash Flows' });
    }
  });
}

module.exports = { registerFinancialStatementRoutes };
