'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('../lib/fiscalYear');

function dayDiff(isoDate) {
  if (!isoDate) return null;
  const t = new Date(String(isoDate).slice(0, 10)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

/**
 * Backs the Dashboard tab in the Accounting workspace (Nonprofit_Dashboard_V1_Spec.md,
 * accounting-scoped V1). Deliberately narrower than OrganizationalAttentionFeed.js: that feed
 * also covers grants/tasks/setup, which belong to the org-wide Dashboard sidebar page, not here.
 * The fiscal-year-unlocked check below reproduces just that one piece of that feed's logic using
 * the same fiscalYear.js helpers, rather than pulling in the whole feed.
 */
function registerAccountingDashboardRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/accounting/dashboard-summary', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    try {
      const cashR = await pool.query(
        `SELECT l.donor_restriction_class::text AS donor_restriction_class,
                COALESCE(SUM(l.debit_cents - l.credit_cents), 0)::bigint AS cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts acc ON acc.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND acc.is_cash_account IS TRUE
         GROUP BY l.donor_restriction_class`,
        [orgId]
      );
      const restrictedCash = { unrestricted_cents: '0', temporarily_restricted_cents: '0', permanently_restricted_cents: '0' };
      for (const row of cashR.rows) {
        const cents = String(row.cents);
        if (row.donor_restriction_class === 'temporarily_restricted') restrictedCash.temporarily_restricted_cents = cents;
        else if (row.donor_restriction_class === 'permanently_restricted') restrictedCash.permanently_restricted_cents = cents;
        else restrictedCash.unrestricted_cents = cents;
      }

      const unconfirmedR = await pool.query(
        `SELECT COUNT(*)::int AS n FROM org_bank_statement_lines
         WHERE org_id = $1 AND status IN ('unconfirmed', 'transfer_pending')`,
        [orgId]
      );

      const pendingR = await pool.query(
        `SELECT t.id, t.transaction_date, t.memo, t.payee,
                COALESCE((SELECT SUM(l.debit_cents) FROM org_ledger_lines l WHERE l.transaction_id = t.id), 0)::bigint AS amount_cents
         FROM org_ledger_transactions t
         WHERE t.org_id = $1 AND t.status = 'pending_approval'
         ORDER BY t.transaction_date ASC, t.id ASC`,
        [orgId]
      );
      const pendingFederalApprovals = pendingR.rows.map((r) => ({
        id: r.id,
        transaction_date: r.transaction_date,
        memo: r.memo,
        payee: r.payee,
        amount_cents: String(r.amount_cents),
      }));

      // Same "close last year by now" nudge as OrganizationalAttentionFeed.js, reproduced with
      // the same fiscalYear.js helpers rather than importing that org-wide feed's grants/tasks.
      let fyUnlocked = null;
      const fyEndMonth = await getFiscalYearEndMonth(pool, orgId);
      const lastCompletedFy = fiscalYearForDate(new Date(), fyEndMonth) - 1;
      const { endDate: lastCompletedFyEnd } = fyDateRange(lastCompletedFy, fyEndMonth);
      const daysSinceFyEnd = dayDiff(lastCompletedFyEnd) != null ? -dayDiff(lastCompletedFyEnd) : null;
      if (daysSinceFyEnd != null && daysSinceFyEnd >= 60) {
        const lockR = await pool.query(
          `SELECT locked_at FROM org_fiscal_year_locks WHERE org_id = $1 AND fiscal_year = $2`,
          [orgId, lastCompletedFy]
        );
        const isLocked = lockR.rows[0] && lockR.rows[0].locked_at != null;
        if (!isLocked) {
          fyUnlocked = { fiscal_year: lastCompletedFy, fy_end_date: lastCompletedFyEnd };
        }
      }

      // This fiscal year's income and expenses from posted ledger entries (statistical accounts
      // excluded -- they are counts like "clients served", not dollars).
      const fyNow = fiscalYearForDate(new Date(), fyEndMonth);
      const { startDate: fyStart, endDate: fyEnd } = fyDateRange(fyNow, fyEndMonth);
      const ytdR = await pool.query(
        `SELECT acc.type::text AS type, COALESCE(SUM(l.credit_cents - l.debit_cents), 0)::bigint AS net_credit_cents
         FROM org_ledger_lines l
         JOIN org_ledger_transactions t ON t.id = l.transaction_id
         JOIN org_accounts acc ON acc.id = l.account_id
         WHERE t.org_id = $1 AND t.status = 'posted' AND acc.type IN ('income', 'expense')
           AND acc.is_statistical IS NOT TRUE AND t.transaction_date BETWEEN $2 AND $3
         GROUP BY acc.type`,
        [orgId, fyStart, fyEnd]
      );
      let incomeCents = 0n, expenseCents = 0n;
      for (const row of ytdR.rows) {
        if (row.type === 'income') incomeCents = BigInt(row.net_credit_cents);
        else expenseCents = -BigInt(row.net_credit_cents);
      }

      return res.json({
        year_to_date: { fiscal_year: fyNow, start_date: fyStart, end_date: fyEnd,
                        income_cents: String(incomeCents), expense_cents: String(expenseCents) },
        restricted_cash: restrictedCash,
        unconfirmed_bank_lines_count: unconfirmedR.rows[0].n,
        pending_federal_approvals: pendingFederalApprovals,
        fy_unlocked: fyUnlocked,
      });
    } catch (e) {
      console.error('GET /accounting/dashboard-summary:', e.message);
      return res.status(500).json({ error: 'Could not load accounting dashboard summary' });
    }
  });

  app.get('/api/organizational/orgs/:slug/accounting/dashboard-activity', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const limit = Math.min(50, Math.max(1, Number.parseInt(String(req.query.limit || '15'), 10) || 15));
    const base = '/organizational/o/' + encodeURIComponent(req.params.slug);
    try {
      const r = await pool.query(
        `(SELECT 'transaction' AS type, t.transaction_date AS date, t.memo AS title, t.id AS record_id,
                 COALESCE((SELECT SUM(l.debit_cents) FROM org_ledger_lines l WHERE l.transaction_id = t.id), 0)::bigint AS amount_cents,
                 $2 || '/transactions' AS href
          FROM org_ledger_transactions t WHERE t.org_id = $1 AND t.status = 'posted')
         UNION ALL
         (SELECT 'bill', b.bill_date, c.display_name, b.id,
                 COALESCE((SELECT SUM(bl.amount_cents) FROM org_bill_lines bl WHERE bl.bill_id = b.id), 0)::bigint,
                 $2 || '/purchases'
          FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
          WHERE b.org_id = $1 AND b.status != 'draft')
         UNION ALL
         (SELECT 'invoice', i.invoice_date, c.display_name, i.id,
                 COALESCE((SELECT SUM(ROUND(il.quantity * il.unit_amount_cents)) FROM org_invoice_lines il WHERE il.invoice_id = i.id), 0)::bigint,
                 $2 || '/sales'
          FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
          WHERE i.org_id = $1 AND i.status != 'draft')
         UNION ALL
         (SELECT 'bank_line', bsl.statement_date, bsl.description_raw, bsl.id,
                 bsl.amount_cents,
                 $2 || '/bank-reconciliation'
          FROM org_bank_statement_lines bsl WHERE bsl.org_id = $1 AND bsl.status = 'confirmed')
         ORDER BY date DESC
         LIMIT $3`,
        [orgId, base, limit]
      );
      const items = r.rows.map((row) => ({
        type: row.type,
        date: row.date,
        id: row.record_id,
        title: row.title || '(no memo)',
        amount_cents: String(row.amount_cents),
        href: row.href,
      }));
      return res.json({ items });
    } catch (e) {
      console.error('GET /accounting/dashboard-activity:', e.message);
      return res.status(500).json({ error: 'Could not load accounting activity feed' });
    }
  });
}

module.exports = { registerAccountingDashboardRoutes };
