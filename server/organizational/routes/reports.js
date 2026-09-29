'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { getOrganizationalExecutiveSummaryText } = require('../lib/OrganizationalSummaryService');
const { fetchBoardReportData, fetchGrantReportData, fallbackGrantNarrative } = require('../lib/OrganizationalReportData');
const { htmlToPdfBuffer } = require('../lib/OrganizationalHtmlPdf');
const { buildCashflowGrid } = require('../lib/cashflowForecast');

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function boardReportHtml(data, executiveSummary) {
  const m = data.metrics;
  const { fmtUsd } = data;
  const grantRows = data.grants
    .map(
      (g) =>
        `<tr><td>${escapeHtml(g.name)}</td><td>${escapeHtml(g.funder || '—')}</td><td class="num">${escapeHtml(fmtUsd(g.amount_cents != null ? g.amount_cents : 0))}</td><td>${escapeHtml(String(g.status || ''))}</td><td>${escapeHtml([g.start_date, g.end_date].filter(Boolean).join(' → ') || '—')}</td></tr>`
    )
    .join('');
  const bvaRows = data.budgetVsActualByProgram
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.program_name)}</td><td class="num">${escapeHtml(fmtUsd(r.budget_cents))}</td><td class="num">${escapeHtml(fmtUsd(r.actual_cents))}</td><td class="num">${escapeHtml(fmtUsd(r.variance_cents))}</td></tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Board report — ${escapeHtml(data.orgName)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.45; }
  h1 { font-size: 18pt; margin: 0 0 4px 0; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 16px; }
  .metrics { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .card { border: 1px solid #ccc; border-radius: 6px; padding: 10px 14px; min-width: 120px; flex: 1 1 120px; background: #fafafa; }
  .card .v { font-size: 14pt; font-weight: 700; }
  .card .l { font-size: 8.5pt; color: #555; text-transform: uppercase; letter-spacing: 0.03em; }
  h2 { font-size: 12pt; margin: 18px 0 8px 0; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .summary { background: #f4f6fb; border: 1px solid #c5d0e6; border-radius: 6px; padding: 12px 14px; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 20px; font-size: 8pt; color: #888; }
</style></head><body>
<h1>${escapeHtml(data.orgName)}</h1>
<div class="sub">Board finance report · Fiscal year ${data.fiscalYear} · Generated ${escapeHtml(data.generatedAt.slice(0, 10))}</div>
<div class="metrics">
  <div class="card"><div class="v">${escapeHtml(m.runway_label)}</div><div class="l">Months of cash</div></div>
  <div class="card"><div class="v">${escapeHtml(fmtUsd(m.revenue_cents))}</div><div class="l">Revenue (actuals)</div></div>
  <div class="card"><div class="v">${escapeHtml(fmtUsd(m.expenses_cents))}</div><div class="l">Expenses (actuals)</div></div>
  <div class="card"><div class="v">${escapeHtml(String(m.active_grants))}</div><div class="l">Active grants</div></div>
</div>
<h2>Executive summary</h2>
<div class="summary">${escapeHtml(executiveSummary)}</div>
<h2>Grants</h2>
<table><thead><tr><th>Grant</th><th>Funder</th><th class="num">Amount</th><th>Status</th><th>Period</th></tr></thead><tbody>
${grantRows || '<tr><td colspan="5">No grants recorded.</td></tr>'}
</tbody></table>
<h2>Budget vs actual by program</h2>
<p style="font-size:9pt;color:#555;margin:0 0 8px 0;">Unrestricted budget lines vs confirmed actuals (same fiscal year).</p>
<table><thead><tr><th>Program</th><th class="num">Budget</th><th class="num">Actual</th><th class="num">Variance</th></tr></thead><tbody>
${bvaRows || '<tr><td colspan="4">No budget or actual data by program.</td></tr>'}
</tbody></table>
<div class="footer">Prepared by Causal</div>
</body></html>`;
}

function grantFactsNotes(g) {
  const bits = [];
  if (g.restrictions != null && g.restrictions !== '') {
    bits.push(typeof g.restrictions === 'object' ? JSON.stringify(g.restrictions) : String(g.restrictions));
  }
  if (g.notes) bits.push(String(g.notes));
  const t = bits.join(' · ').trim();
  return t ? t.slice(0, 1200) : '—';
}

function grantReportHtml(data, narrative) {
  const g = data.grant;
  const { fmtUsd } = data;
  const sched =
    g.reporting_schedule != null
      ? escapeHtml(JSON.stringify(g.reporting_schedule).slice(0, 800))
      : '—';
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Grant report — ${escapeHtml(g.name)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 14px; }
  h2 { font-size: 11pt; margin: 16px 0 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
  th { background: #eee; width: 28%; }
  .narrative { background: #f8f8f8; border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; margin-top: 8px; }
  .footer { margin-top: 18px; font-size: 8pt; color: #888; }
</style></head><body>
<h1>${escapeHtml(g.name)}</h1>
<div class="sub">${escapeHtml(data.orgName)} · FY ${data.fiscalYear}</div>
<h2>Grant facts</h2>
<table>
<tr><th>Funder</th><td>${escapeHtml(g.funder || '—')}</td></tr>
<tr><th>Award amount</th><td>${escapeHtml(fmtUsd(g.amount_cents != null ? g.amount_cents : 0))}</td></tr>
<tr><th>Status</th><td>${escapeHtml(String(g.status || ''))}</td></tr>
<tr><th>Period</th><td>${escapeHtml([g.start_date, g.end_date].filter(Boolean).join(' → ') || '—')}</td></tr>
<tr><th>Budget tagged (FY)</th><td>${escapeHtml(fmtUsd(data.budgeted_to_grant_fy_cents))}${data.utilization_pct != null ? ` (${data.utilization_pct}% of award)` : ''}</td></tr>
<tr><th>Reporting schedule</th><td style="word-break:break-all;font-size:9pt;">${sched}</td></tr>
<tr><th>Restrictions / notes</th><td>${escapeHtml(grantFactsNotes(g))}</td></tr>
</table>
<h2>Narrative draft</h2>
<div class="narrative">${escapeHtml(narrative)}</div>
<div class="footer">Causal</div>
</body></html>`;
}

// Tax boilerplate used in both the email acknowledgment (sendGiftAcknowledgment.js)
// and the PDF receipt. Kept in sync manually for v1; extract to a shared constant if a third
// consumer appears.
const TAX_DISCLAIMER = 'No goods or services were provided in exchange for this contribution. ' +
  'Your contribution is tax-deductible to the extent allowed by law.';

function giftReceiptHtml(gift, constituent, org) {
  const donorName = constituent.display_name ||
    [constituent.first_name, constituent.last_name].filter(Boolean).join(' ') ||
    constituent.email || '(unknown donor)';
  const fmtUsd = c => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(c) / 100);
  const fmtDate = dt => {
    const d = dt instanceof Date ? dt : new Date(String(dt));
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };
  const giftTypeLabels = { grant: 'Grant', donation: 'Donation', pledge: 'Pledge', membership_dues: 'Dues' };
  const typeLabel = giftTypeLabels[gift.gift_type] || gift.gift_type || '—';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"/>
<title>Gift receipt — ${escapeHtml(org.display_name)}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; font-size: 11pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 16pt; margin: 0 0 4px 0; }
  .sub { color: #555; font-size: 9.5pt; margin-bottom: 14px; }
  h2 { font-size: 11pt; margin: 16px 0 8px 0; }
  table { width: 100%; border-collapse: collapse; font-size: 10pt; }
  th, td { border: 1px solid #ddd; padding: 8px 10px; text-align: left; }
  th { background: #eee; width: 32%; }
  .disclaimer { background: #f8f8f8; border: 1px solid #ddd; border-radius: 6px; padding: 12px 14px; margin-top: 16px; font-size: 9.5pt; color: #374151; }
  .footer { margin-top: 18px; font-size: 8pt; color: #888; }
</style></head><body>
<h1>Official Gift Receipt</h1>
<div class="sub">${escapeHtml(org.display_name)}${org.ein ? ` · EIN: ${escapeHtml(org.ein)}` : ''}</div>
<h2>Gift details</h2>
<table>
<tr><th>Donor</th><td>${escapeHtml(donorName)}</td></tr>
<tr><th>Amount</th><td>${escapeHtml(fmtUsd(gift.amount_cents))}</td></tr>
<tr><th>Date received</th><td>${escapeHtml(fmtDate(gift.received_at))}</td></tr>
<tr><th>Gift type</th><td>${escapeHtml(typeLabel)}</td></tr>
${gift.payment_method ? `<tr><th>Payment method</th><td>${escapeHtml(gift.payment_method)}</td></tr>` : ''}
${gift.campaign ? `<tr><th>Campaign / appeal</th><td>${escapeHtml(gift.campaign)}</td></tr>` : ''}
</table>
<div class="disclaimer">${escapeHtml(TAX_DISCLAIMER)}</div>
<div class="footer">Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
</body></html>`;
}

function registerOrganizationalReportRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];

  // GET /api/organizational/orgs/:slug/balance-sheet
  app.get('/api/organizational/orgs/:slug/balance-sheet', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const fy = req.query.fiscal_year ? Number.parseInt(String(req.query.fiscal_year), 10) : null;
    const asOfParam = req.query.as_of_date ? String(req.query.as_of_date).trim() : null;

    try {
      let dateParams = [orgId];
      let dateWhere = '';
      if (fy && Number.isInteger(fy)) {
        dateWhere = `AND as_of_date >= make_date($2 - 1, 1, 1) AND as_of_date <= make_date($2 + 1, 12, 31)`;
        dateParams.push(fy);
      }

      const { rows: dateRows } = await pool.query(
        `SELECT DISTINCT as_of_date FROM org_balance_sheet_snapshots
         WHERE org_id = $1 ${dateWhere} ORDER BY as_of_date DESC`,
        dateParams
      );
      const dates = dateRows.map(r => r.as_of_date);
      if (!dates.length) return res.json({ dates: [], snapshots: [], as_of_date: null });

      const asOfDate = asOfParam && dates.map(String).includes(asOfParam) ? asOfParam : dates[0];

      const { rows } = await pool.query(
        `SELECT
           bs.id, bs.as_of_date, bs.balance_cents, bs.restriction_class, bs.notes,
           a.id AS account_id, a.code, a.name, a.type
         FROM org_balance_sheet_snapshots bs
         JOIN org_accounts a ON a.id = bs.coop_account_id
         WHERE bs.org_id = $1 AND bs.as_of_date = $2
         ORDER BY a.type, a.code, a.name`,
        [orgId, asOfDate]
      );

      const fmt = String(req.query.format || 'json').toLowerCase();
      if (fmt === 'csv') {
        const esc = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
        const totalsByType = { asset: 0, liability: 0, equity: 0 };
        for (const r of rows) {
          const t = String(r.type || '').toLowerCase();
          if (totalsByType[t] != null) totalsByType[t] += Number(r.balance_cents);
        }
        const csvRows = [
          ['Type', 'Code', 'Account', 'Balance ($)', 'Restriction', 'Notes'].join(','),
          ...rows.map((r) => [
            esc(r.type), esc(r.code), esc(r.name),
            (Number(r.balance_cents) / 100).toFixed(2),
            esc(r.restriction_class || ''), esc(r.notes || ''),
          ].join(',')),
          ['TOTAL ASSETS', '', '', (totalsByType.asset / 100).toFixed(2), '', ''].join(','),
          ['TOTAL LIABILITIES', '', '', (totalsByType.liability / 100).toFixed(2), '', ''].join(','),
          ['TOTAL EQUITY / NET ASSETS', '', '', (totalsByType.equity / 100).toFixed(2), '', ''].join(','),
        ].join('\r\n');
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="balance-sheet-${asOfDate}.csv"`);
        return res.send(csvRows);
      }

      res.json({ dates, snapshots: rows, as_of_date: asOfDate });
    } catch (e) {
      console.error('GET /balance-sheet:', e.message);
      res.status(500).json({ error: 'Could not load balance sheet' });
    }
  });

  // GET /api/organizational/orgs/:slug/reports/cash-forecast
  // Rolling N-month cashflow grid (Phase 3 of multi-year budget planning) —
  // same account rows as the budget grid, actual-if-known / forecast-
  // otherwise per cell, plus opening/net-change/closing cash balance.
  app.get('/api/organizational/orgs/:slug/reports/cash-forecast', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const monthsAheadRaw = Number.parseInt(String(req.query.months_ahead || '12'), 10);
    const monthsAhead = Number.isInteger(monthsAheadRaw) && monthsAheadRaw > 0 && monthsAheadRaw <= 36
      ? monthsAheadRaw
      : 12;
    const startDateParam = req.query.start_date ? String(req.query.start_date).trim() : null;
    const startDate = startDateParam && /^\d{4}-\d{2}-\d{2}$/.test(startDateParam)
      ? new Date(`${startDateParam}T00:00:00`)
      : new Date();

    try {
      const grid = await buildCashflowGrid(pool, { orgId, startDate, monthsAhead });
      res.json(grid);
    } catch (e) {
      console.error('GET /reports/cash-forecast:', e.message);
      res.status(500).json({ error: 'Could not build cash forecast' });
    }
  });

  app.get('/api/organizational/orgs/:slug/reports/board', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const orgId = req.orgId;
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).send('fiscal_year required');
    }
    try {
      const refreshSummary =
        req.query.refresh_summary === '1' || String(req.query.refresh_summary || '').toLowerCase() === 'true';
      const [reportData, sumOut] = await Promise.all([
        fetchBoardReportData(pool, orgId, fy),
        getOrganizationalExecutiveSummaryText(pool, orgId, fy, { refresh: refreshSummary }),
      ]);
      const html = boardReportHtml(reportData, sumOut.summary);
      const pdf = await htmlToPdfBuffer(html);
      const fname = `board-report-${slug}-${fy}.pdf`.replace(/[^a-z0-9._-]/gi, '_');
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(pdf);
    } catch (e) {
      console.error('GET /reports/board:', e.message);
      return res.status(500).send('Could not build PDF');
    }
  });

  app.get('/api/organizational/orgs/:slug/reports/grants/:grantId', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const grantId = Number.parseInt(String(req.params.grantId || ''), 10);
    const fy = Number.parseInt(String(req.query.fiscal_year || ''), 10);
    if (!Number.isInteger(grantId) || grantId < 1) {
      return res.status(400).send('grantId invalid');
    }
    if (!Number.isInteger(fy) || fy < 1900 || fy > 2200) {
      return res.status(400).send('fiscal_year required');
    }
    try {
      const data = await fetchGrantReportData(pool, orgId, grantId, fy);
      if (!data) {
        return res.status(404).send('Grant not found');
      }
      const narrative = fallbackGrantNarrative(data);
      const html = grantReportHtml(data, narrative);
      const pdf = await htmlToPdfBuffer(html);
      const safeName = String(data.grant.name || 'grant')
        .slice(0, 40)
        .replace(/[^a-z0-9._-]+/gi, '_');
      const fname = `grant-report-${safeName}-${fy}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(pdf);
    } catch (e) {
      console.error('GET /reports/grants/:grantId:', e.message);
      return res.status(500).send('Could not build PDF');
    }
  });

  // GET /api/organizational/orgs/:slug/reports/gifts/:giftId/receipt
  app.get('/api/organizational/orgs/:slug/reports/gifts/:giftId/receipt', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const giftId = Number.parseInt(String(req.params.giftId || ''), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).send('giftId invalid');
    try {
      const giftR = await pool.query(
        'SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1',
        [giftId, orgId]
      );
      if (!giftR.rows.length) return res.status(404).send('Gift not found');
      const gift = giftR.rows[0];

      let constituent = { display_name: 'Donor', email: null, first_name: null, last_name: null };
      if (gift.constituent_id) {
        const cR = await pool.query(
          'SELECT display_name, first_name, last_name, email FROM org_constituents WHERE id = $1 LIMIT 1',
          [gift.constituent_id]
        );
        if (cR.rows.length) constituent = cR.rows[0];
      }

      const orgR = await pool.query(
        `SELECT o.display_name, s.ein
         FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id
         WHERE o.id = $1 LIMIT 1`,
        [orgId]
      );
      const org = orgR.rows[0] || { display_name: 'Organization', ein: null };

      const html = giftReceiptHtml(gift, constituent, org);
      const pdf  = await htmlToPdfBuffer(html);
      // receipt_sent_at existed on org_gifts (readable via the donors.js gift list, shown
      // next to acknowledgment_sent_at's "✓ ack'd" badge) but nothing ever wrote to it --
      // this endpoint generated the PDF but never recorded that it had. Set on generation,
      // same as acknowledgment_sent_at is set when the ack email actually sends.
      if (!gift.receipt_sent_at) {
        await pool.query('UPDATE org_gifts SET receipt_sent_at = NOW() WHERE id = $1', [giftId]);
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="receipt-${giftId}.pdf"`);
      return res.send(pdf);
    } catch (e) {
      console.error('GET /reports/gifts/:giftId/receipt:', e.message);
      return res.status(500).send('Could not build receipt PDF');
    }
  });
}

module.exports = { registerOrganizationalReportRoutes };
