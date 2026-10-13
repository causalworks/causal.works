'use strict';

// Receivables and payables schedules: what is owed to the organization and what it owes, item by item, aged, with a check
// against the ledger balance of the matching accounts.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess } = require('../middleware/requireAccountingAccess');
const { receivableItems, payableItems } = require('../lib/receivablesPayables');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BUCKETS = ['current', '1_30', '31_60', '61_90', '90_plus'];

function bucketFor(days) {
  return days <= 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : '90_plus';
}
function csvCell(v) {
  return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
}
function daysBetween(asOf, date) {
  const a = Date.parse(asOf + 'T00:00:00Z');
  const b = Date.parse(String(date).slice(0, 10) + 'T00:00:00Z');
  return Math.round((a - b) / 86400000);
}

function registerReceivablesPayablesRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  async function ledgerBalance(orgId, asOf, accountFilterSql, sign) {
    const r = await pool.query(
      `SELECT a.id, a.code, a.name,
              COALESCE(SUM(CASE WHEN t.id IS NOT NULL THEN (l.debit_cents - l.credit_cents) END), 0) AS net
         FROM org_accounts a
         LEFT JOIN org_ledger_lines l ON l.account_id = a.id
         LEFT JOIN org_ledger_transactions t ON t.id = l.transaction_id AND t.status = 'posted' AND t.transaction_date <= $2
        WHERE a.org_id = $1 AND ${accountFilterSql}
        GROUP BY a.id, a.code, a.name
        ORDER BY a.code`, [orgId, asOf]);
    const accounts = r.rows.map((a) => ({ id: a.id, code: a.code, name: a.name, balance_cents: String(sign * Number(a.net)) }));
    return { accounts, balance_cents: accounts.reduce((n, a) => n + Number(a.balance_cents), 0) };
  }

  function summarize(items, asOf, ledger) {
    const totals = { total: 0 };
    BUCKETS.forEach((b) => { totals[b] = 0; });
    for (const it of items) {
      it.days_past_due = it.kind === 'pledge' && !it.due_date ? 0 : daysBetween(asOf, it.due_date || it.date);
      it.bucket = bucketFor(it.days_past_due);
      it.balance_cents = Number(it.balance_cents);
      totals[it.bucket] += it.balance_cents;
      totals.total += it.balance_cents;
    }
    items.sort((a, b) => b.days_past_due - a.days_past_due || String(a.contact_name).localeCompare(String(b.contact_name)));
    return { items, totals, ledger: { ...ledger, difference_cents: ledger.balance_cents - totals.total } };
  }

  function asOfOf(req, res) {
    const asOf = req.query.as_of ? String(req.query.as_of) : new Date().toISOString().slice(0, 10);
    if (!DATE_RE.test(asOf)) { res.status(400).json({ error: 'as_of must be YYYY-MM-DD' }); return null; }
    return asOf;
  }

  function sendCsv(res, name, asOf, out, labels) {
    const rows = [['Contact', 'Type', 'Reference', 'Date', 'Due', 'Balance', 'Days past due', 'Age'].map(csvCell).join(',')];
    for (const it of out.items) {
      rows.push([it.contact_name, labels[it.kind] || it.kind, it.reference, String(it.date || '').slice(0, 10), String(it.due_date || '').slice(0, 10),
        (it.balance_cents / 100).toFixed(2), it.days_past_due, it.bucket].map(csvCell).join(','));
    }
    rows.push(['Total', '', '', '', '', (out.totals.total / 100).toFixed(2)].map(csvCell).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="' + name + '-' + asOf + '.csv"');
    return res.send(rows.join('\r\n') + '\r\n');
  }

  app.get('/api/organizational/orgs/:slug/reports/receivables-schedule', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
    const orgId = req.orgId;
    const asOf = asOfOf(req, res);
    if (!asOf) return;
    try {
      const items = await receivableItems(pool, orgId);
      const ledger = await ledgerBalance(orgId, asOf, `a.type = 'asset' AND (a.is_system_ar_account OR a.name ILIKE '%receivable%')`, 1);
      const out = summarize(items, asOf, ledger);
      if (req.query.format === 'csv') return sendCsv(res, 'receivables-schedule', asOf, out, { invoice: 'Invoice', pledge: 'Pledge' });
      return res.json({ as_of: asOf, ...out });
    } catch (e) {
      console.error('GET reports/receivables-schedule:', e.message);
      return res.status(500).json({ error: 'Could not build the receivables schedule' });
    }
  });

  app.get('/api/organizational/orgs/:slug/reports/payables-schedule', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
    const orgId = req.orgId;
    const asOf = asOfOf(req, res);
    if (!asOf) return;
    try {
      const items = await payableItems(pool, orgId);
      const ledger = await ledgerBalance(orgId, asOf, `a.type = 'liability' AND (a.is_system_ap_account OR a.is_system_expense_claims_payable_account)`, -1);
      const out = summarize(items, asOf, ledger);
      if (req.query.format === 'csv') return sendCsv(res, 'payables-schedule', asOf, out, { bill: 'Bill', claim: 'Expense claim' });
      return res.json({ as_of: asOf, ...out });
    } catch (e) {
      console.error('GET reports/payables-schedule:', e.message);
      return res.status(500).json({ error: 'Could not build the payables schedule' });
    }
  });
}

module.exports = { registerReceivablesPayablesRoutes };
