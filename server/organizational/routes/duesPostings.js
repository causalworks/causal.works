'use strict';

// Accounting > Dues postings: dues payments and refunds recorded in Membership wait here, unposted, until a person with
// Accounting write access confirms them; the monthly recognition run is previewed and confirmed here too.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess, requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const A = require('../lib/membershipAccounting');
const M = require('../lib/membership');
const S = require('../lib/membershipStatus');

function registerDuesPostingRoutes(app, pool) {
  const base = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool), requireAccountingAccess(pool, 'accounting_read')];
  const writer = [...base, requireAccountingWriter(pool)];
  const P = '/api/organizational/orgs/:slug/dues-postings';
  const uid = (req) => req.user && (req.user.user_id ?? req.user.id);
  const posInt = (v) => { const n = Number.parseInt(String(v), 10); return Number.isInteger(n) && n > 0 ? n : null; };

  app.get(P, ...base, async (req, res) => {
    try {
      const month = /^\d{4}-\d{2}$/.test(String(req.query.month || '')) ? String(req.query.month) : S.addMonths(M.today().slice(0, 7) + '-01', -1).slice(0, 7);
      const pending = await pool.query(
        `SELECT p.id, p.kind, p.method, p.amount_cents, p.payment_date, p.reason, p.processor_ref, p.refund_of_id, c.display_name,
                t.starts_on, t.ends_on, tr.name AS tier_name
           FROM org_membership_payments p JOIN org_constituents c ON c.id = p.constituent_id
           JOIN org_membership_terms t ON t.id = p.term_id LEFT JOIN org_membership_tiers tr ON tr.id = t.tier_id
          WHERE p.org_id = $1 AND p.posting_status = 'unposted' AND p.kind IN ('payment', 'refund')
          ORDER BY p.payment_date, p.id`, [req.orgId]);
      const posted = await pool.query(
        `SELECT p.id, p.kind, p.amount_cents, p.payment_date, p.posted_at, p.ledger_transaction_id, p.posted_contribution_cents, p.posted_deferred_cents,
                p.posted_revenue_cents, c.display_name
           FROM org_membership_payments p JOIN org_constituents c ON c.id = p.constituent_id
          WHERE p.org_id = $1 AND p.posting_status = 'posted' ORDER BY p.posted_at DESC NULLS LAST, p.id DESC LIMIT 50`, [req.orgId]);
      const runs = await pool.query(
        `SELECT to_char(month, 'YYYY-MM') AS month, SUM(amount_cents)::int AS cents, COUNT(*)::int AS terms, MAX(ledger_transaction_id) AS ledger_transaction_id
           FROM org_membership_recognition WHERE org_id = $1 GROUP BY month ORDER BY month DESC LIMIT 24`, [req.orgId]);
      const settings = await M.getSettings(pool, req.orgId);
      const bank = await pool.query('SELECT default_bank_account_id FROM org_settings WHERE org_id = $1', [req.orgId]);
      const preview = await A.recognitionPreview(pool, req.orgId, month);
      return res.json({
        pending: pending.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), payment_date: S.toDay(x.payment_date), starts_on: S.toDay(x.starts_on), ends_on: S.toDay(x.ends_on) })),
        posted: posted.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents), payment_date: S.toDay(x.payment_date) })),
        recognition: preview.error ? { month, error: preview.error, rows: [] } : preview,
        runs: runs.rows,
        recognition_mode: settings.recognition_mode,
        default_deposit_account_id: bank.rows[0] ? bank.rows[0].default_bank_account_id : null,
      });
    } catch (e) {
      console.error('GET dues-postings:', e.message);
      return res.status(500).json({ error: 'Could not load dues postings.' });
    }
  });

  app.post(`${P}/:id/post`, ...writer, async (req, res) => {
    try {
      const b = req.body || {};
      const out = await A.postDuesPayment(pool, { orgId: req.orgId, userId: uid(req), paymentId: posInt(req.params.id), postingDate: b.posting_date, depositAccountId: posInt(b.deposit_account_id) });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST dues-postings/:id/post:', e.message);
      return res.status(500).json({ error: 'Could not post the dues payment.' });
    }
  });

  app.post(`${P}/:id/reverse`, ...writer, async (req, res) => {
    try {
      const out = await A.reverseDuesPosting(pool, { orgId: req.orgId, userId: uid(req), paymentId: posInt(req.params.id), reason: (req.body || {}).reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST dues-postings/:id/reverse:', e.message);
      return res.status(500).json({ error: 'Could not reverse the posting.' });
    }
  });

  app.post(`${P}/recognition`, ...writer, async (req, res) => {
    try {
      const out = await A.postRecognition(pool, { orgId: req.orgId, userId: uid(req), month: (req.body || {}).month });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST dues-postings/recognition:', e.message);
      return res.status(500).json({ error: 'Could not post the recognition run.' });
    }
  });

  app.post(`${P}/recognition/reverse`, ...writer, async (req, res) => {
    try {
      const b = req.body || {};
      const out = await A.reverseRecognition(pool, { orgId: req.orgId, userId: uid(req), month: b.month, reason: b.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST dues-postings/recognition/reverse:', e.message);
      return res.status(500).json({ error: 'Could not reverse the recognition run.' });
    }
  });
}

module.exports = { registerDuesPostingRoutes };
