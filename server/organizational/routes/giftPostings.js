'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { postInKindGift, postPledgeCommitment, voidGiftPosting } = require('../lib/giftPosting');
const { computeDuePledgeAccretionPeriods, runPledgeAccretion } = require('../lib/pledgeAccretion');
const { linkOrReclassifyGrantGiftTransaction } = require('../lib/grantGiftPayment');
const { FINANCE_ROLES } = require('../lib/orgRoles');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Accounting-side review queue for in-kind gifts and pledge commitments recorded in Donor CRM
 * (donors.js). Mirrors Bank Reconciliation's unconfirmed-lines-> explicit Create pattern: gifts
 * land here as posting_status = 'unposted' and only get a ledger transaction once someone
 * reviews the account coding and confirms via POST .../post. Donors never calls
 * postLedgerTransaction itself -- see server/organizational/lib/giftPosting.js.
 */
function registerGiftPostingRoutes(app, pool) {
  const auth = requireAuth(pool);
  // Posting a gift to the ledger is an accounting action, not donor-CRM viewing -- admin/finance
  // only, deliberately excluding 'fundraising' (permissions matrix finalized 2026-09-21,
  // .claude/plans/2026-09-19-solid-odi-demo-readiness.md).
  const orgAuth = [
    auth,
    requireOrganizationalAccess,
    requireOrgMembership(pool),
    requireOrgRole(['admin', ...FINANCE_ROLES]),
  ];

  app.get('/api/organizational/orgs/:slug/gift-postings', ...orgAuth, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT g.id, g.gift_type, g.payment_method, g.amount_cents, g.received_at,
                g.in_kind_description, g.in_kind_valuation_method, g.in_kind_revenue_account_id, g.in_kind_expense_account_id,
                g.total_pledged_cents, g.is_multi_year_pledge, g.discount_rate_bps, g.discounted_present_value_cents, g.receivable_account_id,
                g.program_id, g.grant_id, g.constituent_id, c.display_name AS constituent_name,
                gr.name AS grant_name
         FROM org_gifts g
         LEFT JOIN org_constituents c ON c.id = g.constituent_id
         LEFT JOIN org_grants gr ON gr.id = g.grant_id
         WHERE g.org_id = $1 AND g.posting_status = 'unposted'
         ORDER BY g.received_at DESC, g.id DESC`,
        [req.orgId]
      );
      const rows = r.rows.map((row) => ({
        id: row.id,
        gift_type: row.gift_type,
        payment_method: row.payment_method,
        amount_cents: Number(row.amount_cents),
        received_at: row.received_at,
        constituent_name: row.constituent_name || null,
        grant_id: row.grant_id != null ? Number(row.grant_id) : null,
        grant_name: row.grant_name || null,
        program_id: row.program_id != null ? Number(row.program_id) : null,
        in_kind: row.payment_method === 'in_kind' ? {
          description: row.in_kind_description,
          valuation_method: row.in_kind_valuation_method,
          revenue_account_id: row.in_kind_revenue_account_id != null ? Number(row.in_kind_revenue_account_id) : null,
          expense_account_id: row.in_kind_expense_account_id != null ? Number(row.in_kind_expense_account_id) : null,
        } : null,
        pledge: row.gift_type === 'pledge' ? {
          total_pledged_cents: row.total_pledged_cents != null ? Number(row.total_pledged_cents) : null,
          is_multi_year_pledge: !!row.is_multi_year_pledge,
          discount_rate_bps: row.discount_rate_bps != null ? Number(row.discount_rate_bps) : null,
          discounted_present_value_cents: row.discounted_present_value_cents != null ? Number(row.discounted_present_value_cents) : null,
          receivable_account_id: row.receivable_account_id != null ? Number(row.receivable_account_id) : null,
        } : null,
        // Cash grant gifts don't post directly here -- they're matched against the real bank
        // deposit in Bank Reconciliation (ordering 1/2), or linked to an already-posted
        // transaction via link-transaction below (ordering 3, the deposit landed before the
        // grant was entered). Never a manual "Post" button, since that would fabricate cash.
        is_cash_grant: row.gift_type === 'grant' && row.payment_method !== 'in_kind',
      }));
      return res.json({ gift_postings: rows });
    } catch (e) {
      console.error('GET /gift-postings:', e.message);
      return res.status(500).json({ error: 'Could not load pending gift postings' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/post', ...orgAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const postingDate = body.posting_date != null ? String(body.posting_date) : null;

    try {
      const kindR = await pool.query('SELECT gift_type, payment_method FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
      if (!kindR.rows.length) return res.status(404).json({ error: 'Gift not found' });
      const isInKind = kindR.rows[0].payment_method === 'in_kind';
      const isPledge = kindR.rows[0].gift_type === 'pledge';

      let result;
      if (isInKind) {
        result = await postInKindGift(pool, {
          orgId, userId, giftId, postingDate,
          revenueAccountId: body.revenue_account_id != null ? Number(body.revenue_account_id) : undefined,
          expenseAccountId: body.expense_account_id != null ? Number(body.expense_account_id) : undefined,
          programId: body.program_id != null ? Number(body.program_id) : undefined,
          donorRestrictionClass: body.donor_restriction_class !== undefined ? body.donor_restriction_class : undefined,
        });
      } else if (isPledge) {
        result = await postPledgeCommitment(pool, {
          orgId, userId, giftId, postingDate,
          revenueAccountId: body.revenue_account_id != null ? Number(body.revenue_account_id) : undefined,
          receivableAccountId: body.receivable_account_id != null ? Number(body.receivable_account_id) : undefined,
          programId: body.program_id != null ? Number(body.program_id) : undefined,
          donorRestrictionClass: body.donor_restriction_class !== undefined ? body.donor_restriction_class : undefined,
        });
      } else {
        return res.status(400).json({ error: 'This gift is neither in-kind nor a pledge -- nothing to post' });
      }
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/post:', e.message);
      return res.status(500).json({ error: 'Could not post gift' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/void', ...orgAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const voidReason = req.body && req.body.void_reason != null ? String(req.body.void_reason) : null;
    try {
      const result = await voidGiftPosting(pool, { orgId, userId, giftId, voidReason });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/void:', e.message);
      return res.status(500).json({ error: 'Could not void gift posting' });
    }
  });

  // Ordering 3 (cash-first, already coded): the deposit already posted -- via ordinary Create
  // in Bank Reconciliation -- before the grant was entered here, so there's no open statement
  // line left for Match to find. See grantGiftPayment.js's linkOrReclassifyGrantGiftTransaction
  // for the two sub-cases (already sitting in the Unallocated Donor Receipts suspense account
  // vs. coded straight to a real account).
  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/link-transaction', ...orgAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const transactionId = req.body && req.body.ledger_transaction_id != null ? Number.parseInt(String(req.body.ledger_transaction_id), 10) : null;
    if (!Number.isInteger(transactionId) || transactionId < 1) return res.status(400).json({ error: 'ledger_transaction_id is required' });
    try {
      const result = await linkOrReclassifyGrantGiftTransaction(pool, { orgId, userId, giftId, transactionId });
      return res.status(result.httpStatus).json(result.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/link-transaction:', e.message);
      return res.status(500).json({ error: 'Could not link transaction' });
    }
  });

  app.get('/api/organizational/orgs/:slug/pledges/run-accretion-preview', ...orgAuth, async (req, res) => {
    const throughDate = req.query.through_date != null ? String(req.query.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return res.status(400).json({ error: 'through_date is required and must be YYYY-MM-DD' });
    try {
      const due = await computeDuePledgeAccretionPeriods(pool, req.orgId, throughDate);
      return res.json({
        periods: due.map((d) => ({ gift_id: d.gift_id, period_date: d.period_date, amount_cents: String(d.amount_cents) })),
        total_cents: String(due.reduce((s, d) => s + d.amount_cents, 0)),
      });
    } catch (e) {
      console.error('GET /pledges/run-accretion-preview:', e.message);
      return res.status(500).json({ error: 'Could not compute pledge accretion preview' });
    }
  });

  app.post('/api/organizational/orgs/:slug/pledges/run-accretion', ...orgAuth, async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    const throughDate = body.through_date != null ? String(body.through_date) : null;
    if (!throughDate || !DATE_RE.test(throughDate)) return res.status(400).json({ error: 'through_date is required and must be YYYY-MM-DD' });
    const incomeAccountId = body.income_account_id != null ? Number.parseInt(String(body.income_account_id), 10) : null;
    if (!Number.isInteger(incomeAccountId) || incomeAccountId < 1) return res.status(400).json({ error: 'income_account_id is required' });
    try {
      const { posted, failed } = await runPledgeAccretion(pool, { orgId, userId, throughDate, incomeAccountId });
      return res.json({ posted, failed, posted_count: posted.length, failed_count: failed.length });
    } catch (e) {
      console.error('POST /pledges/run-accretion:', e.message);
      return res.status(500).json({ error: 'Could not run pledge accretion' });
    }
  });
}

module.exports = { registerGiftPostingRoutes };
