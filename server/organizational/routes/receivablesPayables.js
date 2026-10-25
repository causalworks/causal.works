'use strict';

const { loadOrgDocInfo, oneLine } = require('../lib/orgLetterhead');
// Receivables and payables schedules: what is owed to the organization and what it owes, item by item, aged, with a check
// against the ledger balance of the matching accounts.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess } = require('../middleware/requireAccountingAccess');
const { requireWriteAccess } = require('../middleware/requireWriteAccess');
const { htmlToPdfBuffer } = require('../lib/OrganizationalHtmlPdf');
const { scheduleReportHtml } = require('../lib/scheduleReportHtml');
const { logAudit } = require('../lib/auditLog');
const { receivableItems, payableItems } = require('../lib/receivablesPayables');
const { addFileInfo } = require('../lib/recordFiles');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { csvCell } = require('../lib/csvCell');

const UPLOADS_ROOT = path.resolve(process.env.CAUSAL_UPLOADS_ROOT || path.join(__dirname, '../../../uploads'));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BUCKETS = ['current', '1_30', '31_60', '61_90', '90_plus'];

function bucketFor(days) {
  return days <= 0 ? 'current' : days <= 30 ? '1_30' : days <= 60 ? '31_60' : days <= 90 ? '61_90' : '90_plus';
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
    const ln = await pool.query(
      `SELECT t.id AS transaction_id, t.transaction_date::text AS date, t.source, a.code, a.name AS account_name,
              COALESCE(NULLIF(c.display_name, ''), t.payee, '') AS contact, COALESCE(NULLIF(l.line_memo, ''), t.memo, '') AS memo,
              (l.debit_cents - l.credit_cents) AS net
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id AND t.status = 'posted' AND t.transaction_date <= $2
         JOIN org_accounts a ON a.id = l.account_id
         LEFT JOIN org_constituents c ON c.id = t.constituent_id
        WHERE a.org_id = $1 AND ${accountFilterSql}
        ORDER BY a.code, t.transaction_date, t.id, l.id`, [orgId, asOf]);
    const lines = ln.rows.map((x) => ({ transaction_id: x.transaction_id, date: x.date, account: x.code + ' ' + x.account_name, contact: x.contact, memo: x.memo,
      amount_cents: String(sign * Number(x.net)), direct: x.source === 'manual' || x.source === 'bank_reconciliation' }));
    return { accounts, lines, balance_cents: accounts.reduce((n, a) => n + Number(a.balance_cents), 0) };
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
    const difference = ledger.balance_cents - totals.total;
    const reconciling = (ledger.reconciling || []).filter((r) => r.amount_cents !== 0);
    const explained = reconciling.reduce((n, r) => n + r.amount_cents, 0);
    return { items, totals, ledger: { ...ledger, difference_cents: difference, reconciling, unexplained_cents: difference - explained } };
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
    rows.push(['Ledger balance', '', '', '', '', (out.ledger.balance_cents / 100).toFixed(2)].map(csvCell).join(','));
    for (const r of out.ledger.reconciling || []) rows.push([r.label, '', '', '', '', (r.amount_cents / 100).toFixed(2)].map(csvCell).join(','));
    if (Number(out.ledger.unexplained_cents)) rows.push(['In the ledger with no record in this schedule', '', '', '', '', (out.ledger.unexplained_cents / 100).toFixed(2)].map(csvCell).join(','));
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="' + name + '-' + asOf + '.csv"');
    return res.send(rows.join('\r\n') + '\r\n');
  }

  const KINDS = {
    receivables: { title: 'Receivables schedule', labels: { invoice: 'Invoice', pledge: 'Pledge' }, ledgerLabel: 'Ledger balance of the receivable accounts',
      items: receivableItems, filter: `a.type = 'asset' AND (a.is_system_ar_account OR a.name ILIKE '%receivable%')`, sign: 1 },
    payables: { title: 'Payables schedule', labels: { bill: 'Bill', claim: 'Expense claim' }, ledgerLabel: 'Ledger balance of the payable accounts',
      items: payableItems, filter: `a.type = 'liability' AND (a.is_system_ap_account OR a.is_system_expense_claims_payable_account)`, sign: -1 },
  };

  // Pledges are listed at face value; the ledger holds them at present value until the discount is accreted.
  async function pledgeDiscountReconciling(orgId) {
    const r = await pool.query(
      `SELECT COALESCE(SUM(g.total_pledged_cents - g.discounted_present_value_cents
                - COALESCE((SELECT SUM(a.amount_cents) FROM org_pledge_accretion_entries a
                              JOIN org_ledger_transactions t ON t.id = a.ledger_transaction_id AND t.status = 'posted'
                             WHERE a.gift_id = g.id), 0)), 0)::bigint AS discount_cents
         FROM org_gifts g
        WHERE g.org_id = $1 AND g.gift_type = 'pledge' AND g.posting_status = 'posted' AND g.discounted_present_value_cents IS NOT NULL
          AND EXISTS (SELECT 1 FROM org_gift_pledge_installments i WHERE i.gift_id = g.id AND i.status = 'expected')`, [orgId]);
    const cents = Number(r.rows[0].discount_cents);
    return cents ? [{ label: 'Unamortized discount on pledges (listed here at face value, held in the ledger at present value)', amount_cents: -cents }] : [];
  }

  async function buildSchedule(orgId, kind, asOf) {
    const cfg = KINDS[kind];
    const items = await cfg.items(pool, orgId);
    for (const [kind, type] of [['invoice', 'invoice'], ['bill', 'bill'], ['claim', 'expense_claim']]) {
      await addFileInfo(pool, orgId, items.filter((it) => it.kind === kind), type);
    }
    const ledger = await ledgerBalance(orgId, asOf, cfg.filter, cfg.sign);
    ledger.reconciling = kind === 'receivables' ? await pledgeDiscountReconciling(orgId) : [];
    return summarize(items, asOf, ledger);
  }

  ['receivables', 'payables'].forEach((kind) => {
    app.get('/api/organizational/orgs/:slug/reports/' + kind + '-schedule', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
      const asOf = asOfOf(req, res);
      if (!asOf) return;
      try {
        const out = await buildSchedule(req.orgId, kind, asOf);
        if (req.query.format === 'csv') return sendCsv(res, kind + '-schedule', asOf, out, KINDS[kind].labels);
        return res.json({ as_of: asOf, ...out });
      } catch (e) {
        console.error('GET reports/' + kind + '-schedule:', e.message);
        return res.status(500).json({ error: 'Could not build the ' + kind + ' schedule' });
      }
    });

    app.get('/api/organizational/orgs/:slug/reports/' + kind + '-schedule/saved', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
      try {
        const r = await pool.query(
          `SELECT d.id, d.title, d.document_date::text AS as_of, d.byte_size, d.created_at, u.email AS saved_by
             FROM org_documents d LEFT JOIN users u ON u.id = d.uploaded_by_user_id
            WHERE d.org_id = $1 AND d.category = 'saved_report' AND d.source_ref_type = $2 AND d.archived_at IS NULL
            ORDER BY d.created_at DESC LIMIT 100`, [req.orgId, kind + '-schedule']);
        return res.json({ copies: r.rows.map((x) => ({ id: x.id, title: x.title, as_of: x.as_of, byte_size: Number(x.byte_size), created_at: x.created_at, saved_by: x.saved_by })) });
      } catch (e) {
        console.error('GET reports/' + kind + '-schedule/saved:', e.message);
        return res.status(500).json({ error: 'Could not load the saved copies' });
      }
    });

    app.post('/api/organizational/orgs/:slug/reports/' + kind + '-schedule/save', ...orgAuth, requireWriteAccess('finance'), async (req, res) => {
      const asOf = asOfOf(req, res);
      if (!asOf) return;
      const orgId = req.orgId;
      const userId = req.user.user_id ?? req.user.id;
      let filePath = null;
      try {
        const cfg = KINDS[kind];
        const out = await buildSchedule(orgId, kind, asOf);
        const html = scheduleReportHtml({ title: cfg.title, orgName: oneLine(await loadOrgDocInfo(pool, orgId)), asOf, out, labels: cfg.labels, ledgerLabel: cfg.ledgerLabel });
        const pdf = await htmlToPdfBuffer(html);
        const dir = path.join(UPLOADS_ROOT, 'documents', String(orgId), String(new Date().getUTCFullYear()));
        fs.mkdirSync(dir, { recursive: true });
        filePath = path.join(dir, 'saved-' + crypto.randomBytes(12).toString('hex') + '.pdf');
        fs.writeFileSync(filePath, pdf);
        const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
        const r = await pool.query(
          `INSERT INTO org_documents
             (org_id, category, title, original_filename, stored_path, mime_type, byte_size, checksum_sha256, document_date,
              retention_class, visibility, source_ref_type, uploaded_by_user_id)
           VALUES ($1, 'saved_report', $2, $3, $4, 'application/pdf', $5, $6, $7::date, 'fixed_term', 'admins_only', $8, $9)
           RETURNING id`,
          [orgId, cfg.title + ' as of ' + asOf, kind + '-schedule-' + asOf + '.pdf', path.relative(UPLOADS_ROOT, filePath), pdf.length, checksum, asOf, kind + '-schedule', userId]);
        await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_documents', recordId: r.rows[0].id, metadata: { saved_report: kind + '-schedule', as_of: asOf } });
        return res.status(201).json({ id: r.rows[0].id });
      } catch (e) {
        if (filePath) fs.unlink(filePath, () => {});
        console.error('POST reports/' + kind + '-schedule/save:', e.message);
        return res.status(500).json({ error: 'Could not save a copy' });
      }
    });
  });

  app.get('/api/organizational/orgs/:slug/reports/saved-copies/:id/download', ...orgAuth, requireAccountingAccess(pool, 'reports'), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT stored_path, original_filename FROM org_documents WHERE id = $1 AND org_id = $2 AND category = 'saved_report' AND archived_at IS NULL`, [Number(req.params.id), req.orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Saved copy not found' });
      const full = path.resolve(UPLOADS_ROOT, r.rows[0].stored_path);
      if (!full.startsWith(UPLOADS_ROOT + path.sep) || !fs.existsSync(full)) return res.status(404).json({ error: 'The saved file is no longer on the server' });
      res.set('Content-Type', 'application/pdf');
      res.set('Content-Disposition', 'inline; filename="' + r.rows[0].original_filename + '"');
      return fs.createReadStream(full).pipe(res);
    } catch (e) {
      console.error('GET reports/saved-copies/:id/download:', e.message);
      return res.status(500).json({ error: 'Could not open the saved copy' });
    }
  });

  app.delete('/api/organizational/orgs/:slug/reports/saved-copies/:id', ...orgAuth, requireWriteAccess('finance'), async (req, res) => {
    try {
      const r = await pool.query(
        `DELETE FROM org_documents WHERE id = $1 AND org_id = $2 AND category = 'saved_report' RETURNING id, stored_path`, [Number(req.params.id), req.orgId]);
      if (!r.rows.length) return res.status(404).json({ error: 'Saved copy not found' });
      const full = path.resolve(UPLOADS_ROOT, r.rows[0].stored_path);
      if (full.startsWith(UPLOADS_ROOT + path.sep)) fs.unlink(full, () => {});
      await logAudit(pool, { orgId: req.orgId, userId: req.user.user_id ?? req.user.id, action: 'delete', tableName: 'org_documents', recordId: r.rows[0].id, metadata: { saved_report: true } });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE reports/saved-copies/:id:', e.message);
      return res.status(500).json({ error: 'Could not delete the saved copy' });
    }
  });
}

module.exports = { registerReceivablesPayablesRoutes };
