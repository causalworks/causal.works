'use strict';

const { logAudit } = require('../lib/auditLog');

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireAccountingWriter } = require('../middleware/requireAccountingAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireAccountingAccess } = require('../middleware/requireAccountingAccess');
const { computeDuePledgeAccretionPeriods } = require('../lib/pledgeAccretion');
const { runTool, ctxFromReq } = require('../tools');
const { FINANCE_ROLES } = require('../lib/orgRoles');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function registerGiftPostingRoutes(app, pool) {
  const auth = requireAuth(pool);
  const readGate = (req, res, next) => {
    if (['admin', ...FINANCE_ROLES].includes(req.coopOrgRole) || (req.accessPermissions || []).includes('accounting_read')) return next();
    return res.status(403).json({ code: 'no_access', error: 'You do not have access to gift postings. Ask an admin to give you access.' });
  };
  const orgAuth = [auth, requireOrganizationalAccess, requireOrgMembership(pool), readGate];
  const writeAuth = [...orgAuth, requireAccountingWriter(pool)];

  app.get('/api/organizational/orgs/:slug/gift-postings', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT g.id, g.gift_type, g.payment_method, g.amount_cents, g.received_at,
                g.in_kind_description, g.in_kind_valuation_method, g.in_kind_revenue_account_id, g.in_kind_expense_account_id,
                g.total_pledged_cents, g.is_multi_year_pledge, g.discount_rate_bps, g.pledge_years, g.discounted_present_value_cents, g.receivable_account_id,
                g.pledge_status, g.pledge_status_changed_at, g.pledge_status_note, u.email AS pledge_status_changed_by_email,
                g.program_id, g.grant_id, g.constituent_id, c.display_name AS constituent_name, c.kind AS constituent_kind,
                gr.name AS grant_name
         FROM org_gifts g
         LEFT JOIN org_constituents c ON c.id = g.constituent_id
         LEFT JOIN org_grants gr ON gr.id = g.grant_id
         LEFT JOIN users u ON u.id = g.pledge_status_changed_by
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
        constituent_kind: row.constituent_kind || null,
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
          pledge_years: row.pledge_years != null ? Number(row.pledge_years) : null,
          needs_discounting: !!row.is_multi_year_pledge,
          pledge_status: row.pledge_status || null,
          marked_by: row.pledge_status_changed_by_email || null,
          marked_at: row.pledge_status_changed_at || null,
          marked_note: row.pledge_status_note || null,
          discounted_present_value_cents: row.discounted_present_value_cents != null ? Number(row.discounted_present_value_cents) : null,
          receivable_account_id: row.receivable_account_id != null ? Number(row.receivable_account_id) : null,
        } : null,
        is_cash_grant: row.gift_type === 'grant' && row.payment_method !== 'in_kind',
      }));
      const d = await pool.query(
        `SELECT d.id, d.disbursement_date, d.amount_cents, d.admin_fee_cents, d.notes, p.id AS project_id, p.name AS project_name,
                p.program_id, p.disbursement_expense_account_id, COALESCE(p.sponsorship_model::text, s.sponsorship_model::text) AS model, d.kind
           FROM org_sponsored_project_disbursements d
           JOIN org_sponsored_projects p ON p.id = d.sponsored_project_id
           LEFT JOIN org_settings s ON s.org_id = d.org_id
          WHERE d.org_id = $1 AND d.status = 'approved' AND d.ledger_transaction_id IS NULL
          ORDER BY d.disbursement_date, d.id`, [req.orgId]);
      const f = await pool.query(
        `SELECT g.id, g.amount_cents, g.received_at, g.not_gift_note, g.not_gift_flagged_at, g.ledger_transaction_id, c.display_name AS constituent_name, u.email AS flagged_by
           FROM org_gifts g LEFT JOIN org_constituents c ON c.id = g.constituent_id LEFT JOIN users u ON u.id = g.not_gift_flagged_by
          WHERE g.org_id = $1 AND g.not_gift_flagged_at IS NOT NULL AND g.review_status <> 'dismissed' AND g.posting_status <> 'void'
          ORDER BY g.not_gift_flagged_at`, [req.orgId]);
      const u = await pool.query(
        `SELECT g.id, g.amount_cents, g.received_at, g.gift_type::text AS gift_type, g.posting_status, g.ledger_transaction_id, c.display_name AS constituent_name
           FROM org_gifts g
           JOIN org_settings s ON s.org_id = g.org_id AND s.fiscal_sponsorship_mode
           JOIN org_sponsor_settings ss ON ss.org_id = g.org_id
           LEFT JOIN org_constituents c ON c.id = g.constituent_id
          WHERE g.org_id = $1 AND g.sponsored_project_id IS NULL AND g.sponsor_untagged_reviewed_at IS NULL
            AND g.posting_status <> 'void' AND g.review_status <> 'dismissed'
            AND g.created_at >= ss.untagged_review_from
          ORDER BY g.received_at DESC, g.id DESC LIMIT 200`, [req.orgId]);
      const rc = await pool.query(
        `SELECT r.id, r.amount_cents, r.recall_date::text AS recall_date, r.reason, p.id AS project_id, p.name AS project_name
           FROM org_sponsor_recalls r JOIN org_sponsored_projects p ON p.id = r.sponsored_project_id
          WHERE r.org_id = $1 AND r.status = 'pending' ORDER BY r.recall_date, r.id`, [req.orgId]);
      const cl = await pool.query(
        `SELECT c.id, c.amount_cents, c.closing_date::text AS closing_date, c.reason, c.destination_kind, k.display_name AS destination_name,
                p.id AS project_id, p.name AS project_name, p.disbursement_expense_account_id
           FROM org_sponsor_closings c JOIN org_sponsored_projects p ON p.id = c.sponsored_project_id
           LEFT JOIN org_constituents k ON k.id = c.destination_constituent_id
          WHERE c.org_id = $1 AND c.status = 'pending' ORDER BY c.closing_date, c.id`, [req.orgId]);
      const fsR = await pool.query('SELECT fiscal_sponsorship_mode FROM org_settings WHERE org_id = $1', [req.orgId]);
      return res.json({
        sponsor_closings: cl.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        fiscal_sponsor: !!(fsR.rows[0] && fsR.rows[0].fiscal_sponsorship_mode),
        sponsor_recalls: rc.rows.map((x) => ({ ...x, amount_cents: Number(x.amount_cents) })),
        sponsor_untagged: u.rows.map((x) => ({ id: x.id, amount_cents: Number(x.amount_cents), received_at: x.received_at, gift_type: x.gift_type,
          in_books: !!x.ledger_transaction_id, constituent_name: x.constituent_name || null })),
        flagged: f.rows.map((x) => ({ id: x.id, amount_cents: Number(x.amount_cents), received_at: x.received_at, note: x.not_gift_note, flagged_at: x.not_gift_flagged_at,
          flagged_by: x.flagged_by, ledger_transaction_id: x.ledger_transaction_id, constituent_name: x.constituent_name || null })),
        gift_postings: rows,
        disbursements: d.rows.map((x) => ({
          id: x.id, date: String(x.disbursement_date).slice(0, 10), amount_cents: Number(x.amount_cents), admin_fee_cents: x.admin_fee_cents != null ? Number(x.admin_fee_cents) : null,
          notes: x.notes || null, project_id: x.project_id, project_name: x.project_name, program_id: x.program_id != null ? Number(x.program_id) : null,
          expense_account_id: x.disbursement_expense_account_id != null ? Number(x.disbursement_expense_account_id) : null, model: x.model || null, kind: x.kind || 'cash',
        })),
      });
    } catch (e) {
      console.error('GET /gift-postings:', e.message);
      return res.status(500).json({ error: 'Could not load pending gift postings' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/post', ...writeAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    try {
      const out = await runTool('gift.post', ctxFromReq(pool, req), { ...(req.body || {}), id: giftId });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/post:', e.message);
      return res.status(500).json({ error: 'Could not post gift' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/disbursement/:id/post', ...writeAuth, async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid disbursement id' });
    const b = req.body || {};
    try {
      const out = await runTool('disbursement.post', ctxFromReq(pool, req), { ...b, id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) { console.error('POST disbursement post:', e.message); return res.status(500).json({ error: 'Could not post the disbursement' }); }
  });
  app.post('/api/organizational/orgs/:slug/gift-postings/disbursement/:id/unpost', ...writeAuth, async (req, res) => {
    const id = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: 'invalid disbursement id' });
    try {
      const out = await runTool('disbursement.unpost', ctxFromReq(pool, req), { id, reason: req.body && req.body.reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) { console.error('POST disbursement unpost:', e.message); return res.status(500).json({ error: 'Could not unpost the disbursement' }); }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/not-a-gift', ...writeAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    try {
      const out = await runTool('gift.resolve_not_a_gift', ctxFromReq(pool, req), { ...(req.body || {}), id: giftId });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/not-a-gift:', e.message);
      return res.status(500).json({ error: 'Could not resolve the flag' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/sponsor-review', ...writeAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    const body = req.body || {};
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const projectId = body.sponsored_project_id != null && body.sponsored_project_id !== '' ? Number.parseInt(String(body.sponsored_project_id), 10) : null;
    if (!projectId && !body.own) return res.status(400).json({ error: 'Choose the project this gift is for, or mark it as the workspace\'s own.' });
    try {
      const g = await pool.query('SELECT id, ledger_transaction_id, sponsored_project_id FROM org_gifts WHERE id = $1 AND org_id = $2', [giftId, orgId]);
      if (!g.rows.length) return res.status(404).json({ error: 'Gift not found' });
      if (projectId) {
        if (g.rows[0].ledger_transaction_id) {
          return res.status(409).json({ error: 'This gift is already in the books under another program. Recode the entry in Transactions to the project\'s program, then tag the gift in Funding.', code: 'already_in_books' });
        }
        const p = await pool.query('SELECT id, name, status FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2', [projectId, orgId]);
        if (!p.rows.length) return res.status(400).json({ error: 'Choose a sponsored project from this workspace.' });
        if (p.rows[0].status === 'ended' || p.rows[0].status === 'winding_down') return res.status(409).json({ code: 'project_closing', error: 'That project is closing and takes no new income.' });
        await pool.query('UPDATE org_gifts SET sponsored_project_id = $1, sponsor_untagged_reviewed_at = now(), sponsor_untagged_reviewed_by = $2 WHERE id = $3 AND org_id = $4', [projectId, userId, giftId, orgId]);
        await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
          fields: [{ fieldName: 'Sponsored project', oldValue: null, newValue: p.rows[0].name }] });
        return res.json({ id: giftId, sponsored_project_id: projectId });
      }
      await pool.query('UPDATE org_gifts SET sponsor_untagged_reviewed_at = now(), sponsor_untagged_reviewed_by = $1 WHERE id = $2 AND org_id = $3', [userId, giftId, orgId]);
      await logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Sponsored project', oldValue: 'not tagged, flagged for review', newValue: 'the workspace\'s own gift' }] });
      return res.json({ id: giftId, sponsored_project_id: null, reviewed: true });
    } catch (e) {
      console.error('POST /gift-postings/:giftId/sponsor-review:', e.message);
      return res.status(500).json({ error: 'Could not save the review' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/void', ...writeAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    try {
      const out = await runTool('gift.void_posting', ctxFromReq(pool, req), { id: giftId, void_reason: req.body && req.body.void_reason });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/void:', e.message);
      return res.status(500).json({ error: 'Could not void gift posting' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gift-postings/:giftId/link-transaction', ...writeAuth, async (req, res) => {
    const giftId = Number.parseInt(String(req.params.giftId), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'invalid gift id' });
    try {
      const out = await runTool('gift.link_transaction', ctxFromReq(pool, req), { id: giftId, ledger_transaction_id: req.body && req.body.ledger_transaction_id });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /gift-postings/:giftId/link-transaction:', e.message);
      return res.status(500).json({ error: 'Could not link transaction' });
    }
  });

  app.get('/api/organizational/orgs/:slug/pledges/run-accretion-preview', ...orgAuth, requireAccountingAccess(pool, 'accounting_read'), async (req, res) => {
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

  app.post('/api/organizational/orgs/:slug/pledges/run-accretion', ...writeAuth, async (req, res) => {
    try {
      const out = await runTool('pledge.run_accretion', ctxFromReq(pool, req), req.body || {});
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST /pledges/run-accretion:', e.message);
      return res.status(500).json({ error: 'Could not run pledge accretion' });
    }
  });
}

module.exports = { registerGiftPostingRoutes };
