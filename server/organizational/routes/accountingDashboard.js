'use strict';

const { receivableItems } = require('../lib/receivablesPayables');
const { requireAuth } = require('../../auth');
const { waitingForAnAsset } = require('../lib/fixedAssetWaiting');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess } = require('../middleware/requireAccountingAccess');
const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('../lib/fiscalYear');

function dayDiff(isoDate) {
  if (!isoDate) return null;
  const t = new Date(String(isoDate).slice(0, 10)).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

function registerAccountingDashboardRoutes(app, pool) {
  const orgAuth = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];

  app.get('/api/organizational/orgs/:slug/accounting/dashboard-summary', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
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

      const billsR = await pool.query(
        `WITH open_bills AS (
           SELECT b.id, COALESCE(b.due_date, b.bill_date) AS due,
                  COALESCE((SELECT SUM(amount_cents) FROM org_bill_lines WHERE bill_id = b.id), 0)
                    - COALESCE((SELECT SUM(amount_cents) FROM org_bill_payments WHERE bill_id = b.id AND status = 'posted'), 0) AS remaining
             FROM org_bills b WHERE b.org_id = $1 AND b.status IN ('approved', 'scheduled', 'partially_paid'))
         SELECT COUNT(*) FILTER (WHERE due < CURRENT_DATE)::int AS overdue_n,
                COALESCE(SUM(remaining) FILTER (WHERE due < CURRENT_DATE), 0)::bigint AS overdue_cents,
                COUNT(*) FILTER (WHERE due >= CURRENT_DATE AND due <= CURRENT_DATE + 7)::int AS week_n,
                COALESCE(SUM(remaining) FILTER (WHERE due >= CURRENT_DATE AND due <= CURRENT_DATE + 7), 0)::bigint AS week_cents,
                COALESCE(SUM(remaining) FILTER (WHERE due <= CURRENT_DATE + 30), 0)::bigint AS due30_cents,
                COALESCE(SUM(remaining), 0)::bigint AS open_cents
           FROM open_bills`,
        [orgId]
      );
      const invR = await pool.query(
        `WITH open_inv AS (
           SELECT i.id, COALESCE(i.due_date, i.invoice_date) AS due,
                  COALESCE((SELECT SUM(ROUND(quantity * unit_amount_cents)) FROM org_invoice_lines WHERE invoice_id = i.id), 0)
                    - COALESCE((SELECT SUM(amount_cents) FROM org_invoice_payments WHERE invoice_id = i.id AND status = 'posted'), 0) AS remaining
             FROM org_invoices i WHERE i.org_id = $1 AND i.status IN ('sent', 'partially_paid', 'overdue'))
         SELECT COUNT(*) FILTER (WHERE due < CURRENT_DATE)::int AS overdue_n,
                COALESCE(SUM(remaining) FILTER (WHERE due < CURRENT_DATE), 0)::bigint AS overdue_cents,
                COALESCE(SUM(remaining), 0)::bigint AS open_cents
           FROM open_inv`,
        [orgId]
      );
      const countsR = await pool.query(
        `SELECT (SELECT COUNT(*) FROM org_bills WHERE org_id = $1 AND status = 'pending_approval')::int AS bills_pending_approval,
                ((SELECT COUNT(*) FROM org_gifts WHERE org_id = $1 AND posting_status = 'unposted') + (SELECT COUNT(*) FROM org_sponsored_project_disbursements WHERE org_id = $1 AND status = 'approved' AND ledger_transaction_id IS NULL))::int AS gift_postings_waiting,
                (SELECT COUNT(*) FROM org_expense_claims WHERE org_id = $1 AND status = 'pending_approval')::int AS claims_to_approve,
                (SELECT COUNT(*) FROM org_expense_claims WHERE org_id = $1 AND status = 'approved')::int AS claims_to_pay`,
        [orgId]
      );
      const fixedWaiting = await waitingForAnAsset(pool, orgId);
      const owed = await receivableItems(pool, orgId);
      const todayIso = new Date().toISOString().slice(0, 10);
      const owedTotal = owed.reduce((n, it) => n + Number(it.balance_cents), 0);
      const owedOverdue = owed.filter((it) => String(it.due_date || '').slice(0, 10) && String(it.due_date).slice(0, 10) < todayIso).reduce((n, it) => n + Number(it.balance_cents), 0);
      const b = billsR.rows[0], iv = invR.rows[0], c = countsR.rows[0];
      const todo = {
        bills_pending_approval: c.bills_pending_approval,
        bills_overdue: { count: b.overdue_n, cents: String(b.overdue_cents) },
        bills_due_week: { count: b.week_n, cents: String(b.week_cents) },
        bills_due_30_cents: String(b.due30_cents),
        bills_open_cents: String(b.open_cents),
        invoices_overdue: { count: iv.overdue_n, cents: String(iv.overdue_cents) },
        invoices_open_cents: String(iv.open_cents),
        owed_to_you_cents: String(owedTotal),
        owed_to_you_overdue_cents: String(owedOverdue),
        gift_postings_waiting: c.gift_postings_waiting,
        claims_to_approve: c.claims_to_approve,
        claims_to_pay: c.claims_to_pay,
        fixed_assets_waiting: fixedWaiting.cost_entries.length + (Number(fixedWaiting.depreciation_unassigned_cents) > 0 ? 1 : 0),
      };

      return res.json({
        todo,
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

  app.get('/api/organizational/orgs/:slug/accounting/dashboard-activity', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
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
                 (CASE WHEN b.status = 'void' THEN 0 ELSE COALESCE((SELECT SUM(bl.amount_cents) FROM org_bill_lines bl WHERE bl.bill_id = b.id), 0) END)::bigint,
                 $2 || '/purchases'
          FROM org_bills b JOIN org_constituents c ON c.id = b.constituent_id
          WHERE b.org_id = $1 AND b.status != 'draft')
         UNION ALL
         (SELECT 'invoice', i.invoice_date, c.display_name, i.id,
                 (CASE WHEN i.status = 'void' THEN 0 ELSE COALESCE((SELECT SUM(ROUND(il.quantity * il.unit_amount_cents)) FROM org_invoice_lines il WHERE il.invoice_id = i.id), 0) END)::bigint,
                 $2 || '/sales'
          FROM org_invoices i JOIN org_constituents c ON c.id = i.constituent_id
          WHERE i.org_id = $1 AND i.status != 'draft')
         UNION ALL
         (SELECT 'bank_line', bsl.statement_date, bsl.description_raw, bsl.id,
                 bsl.amount_cents,
                 $2 || '/banking'
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
