// Membership management routes (W1.4)
// Manages an org's dues-paying constituency members (distinct from org_users)

const express = require('express');
const { enterOrgContext } = require('../lib/orgContext');
const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership } = require('../middleware/requireOrgMembership');
// mergeParams: true is required for req.params.slug to reach these handlers at all -- without
// it, a sub-router mounted via app.use('/api/organizational/:slug/membership', router) only
// sees params matched by its OWN route patterns (none of which declare :slug), not the mount
// path's. Confirmed live: req.params was {} before this fix.
const router = express.Router({ mergeParams: true });

function registerMembershipRoutes(app, pool) {
  // SECURITY FIX (2026-09-21): this router had NO auth check at all -- every handler resolved
  // the org straight from the URL slug with zero verification the requester was even logged in,
  // let alone a member of that org. Confirmed live: an unauthenticated curl request returned a
  // real 200 with member data for an arbitrary org slug. router.use (not per-route) so every
  // current and future route in this file is covered by a single chokepoint, matching the
  // orgAuth pattern used everywhere else in this codebase.
  router.use(requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool));

  const NP_MEMBERSHIP_SELECT_FIELDS = `t.id,
    t.org_id,
    t.name,
    t.description,
    t.dues_amount_cents,
    t.dues_currency,
    t.renewal_period::text AS renewal_period,
    t.benefits_markdown,
    t.is_active,
    t.display_order,
    t.revenue_account_id,
    t.program_id,
    t.created_at,
    t.updated_at`;

  const NP_MEMBER_SELECT_FIELDS = `m.id,
    m.org_id,
    m.tier_id,
    t.name AS tier_name,
    m.first_name,
    m.last_name,
    m.email,
    m.phone,
    m.mailing_address,
    m.joined_at,
    m.current_period_start,
    m.current_period_end,
    m.status::text AS status,
    m.notes,
    m.cooperative_user_id,
    m.created_at,
    m.updated_at`;

  // GET /api/organizational/:slug/membership/tiers — list org's tiers
  router.get('/tiers', async (req, res) => {
    const orgSlug = req.params.slug;
    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const r = await pool.query(
        `SELECT ${NP_MEMBERSHIP_SELECT_FIELDS}
         FROM org_membership_tiers t
         WHERE t.org_id = $1
         ORDER BY t.display_order ASC, t.created_at ASC`,
        [orgId]
      );
      res.json({ tiers: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/tiers:', e.message);
      res.status(500).json({ error: 'Could not load tiers', tiers: [] });
    }
  });

  // POST /api/organizational/:slug/membership/tiers — create tier
  router.post('/tiers', async (req, res) => {
    const orgSlug = req.params.slug;
    const { name, description, dues_amount_cents, dues_currency, renewal_period, benefits_markdown, display_order } = req.body;
    if (!name || !dues_amount_cents) return res.status(400).json({ error: 'Name and dues amount required' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const r = await pool.query(
        `INSERT INTO org_membership_tiers AS t
         (org_id, name, description, dues_amount_cents, dues_currency, renewal_period, benefits_markdown, display_order)
         VALUES ($1, $2, $3, $4, $5, $6::renewal_period, $7, $8)
         RETURNING ${NP_MEMBERSHIP_SELECT_FIELDS}`,
        [orgId, name, description || null, dues_amount_cents, dues_currency || 'USD', renewal_period || 'annual', benefits_markdown || null, display_order || 0]
      );
      res.status(201).json({ tier: r.rows[0] });
    } catch (e) {
      console.error('❌ POST /api/organizational/:slug/membership/tiers:', e.message);
      res.status(500).json({ error: 'Could not create tier' });
    }
  });

  // PATCH /api/organizational/:slug/membership/tiers/:id — update tier
  router.patch('/tiers/:id', async (req, res) => {
    const tierId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    const { name, description, dues_amount_cents, dues_currency, renewal_period, benefits_markdown, is_active, display_order } = req.body;
    if (!Number.isInteger(tierId) || tierId < 1) return res.status(400).json({ error: 'Invalid tier id' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (name !== undefined) { updates.push(`name = $${paramIndex}`); values.push(name); paramIndex++; }
      if (description !== undefined) { updates.push(`description = $${paramIndex}`); values.push(description); paramIndex++; }
      if (dues_amount_cents !== undefined) { updates.push(`dues_amount_cents = $${paramIndex}`); values.push(dues_amount_cents); paramIndex++; }
      if (dues_currency !== undefined) { updates.push(`dues_currency = $${paramIndex}`); values.push(dues_currency); paramIndex++; }
      if (renewal_period !== undefined) { updates.push(`renewal_period = $${paramIndex}::renewal_period`); values.push(renewal_period); paramIndex++; }
      if (benefits_markdown !== undefined) { updates.push(`benefits_markdown = $${paramIndex}`); values.push(benefits_markdown); paramIndex++; }
      if (is_active !== undefined) { updates.push(`is_active = $${paramIndex}`); values.push(is_active); paramIndex++; }
      if (display_order !== undefined) { updates.push(`display_order = $${paramIndex}`); values.push(display_order); paramIndex++; }
      // Set only from Bank Reconciliation's Match tab inline picker (same segregation-of-duties
      // precedent as org_grants.revenue_account_id) -- which GL account/program dues post to is
      // an Accounting decision, not a Membership one.
      if (req.body.revenue_account_id !== undefined) { updates.push(`revenue_account_id = $${paramIndex}`); values.push(req.body.revenue_account_id); paramIndex++; }
      if (req.body.program_id !== undefined) { updates.push(`program_id = $${paramIndex}`); values.push(req.body.program_id); paramIndex++; }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      updates.push('updated_at = NOW()');
      values.push(tierId, orgId);

      const r = await pool.query(
        `UPDATE org_membership_tiers AS t
         SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND org_id = $${paramIndex + 1}
         RETURNING ${NP_MEMBERSHIP_SELECT_FIELDS}`,
        values
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Tier not found' });
      res.json({ tier: r.rows[0] });
    } catch (e) {
      console.error('❌ PATCH /api/organizational/:slug/membership/tiers/:id:', e.message);
      res.status(500).json({ error: 'Could not update tier' });
    }
  });

  // DELETE /api/organizational/:slug/membership/tiers/:id — delete tier
  router.delete('/tiers/:id', async (req, res) => {
    const tierId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    if (!Number.isInteger(tierId) || tierId < 1) return res.status(400).json({ error: 'Invalid tier id' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const r = await pool.query(
        'DELETE FROM org_membership_tiers WHERE id = $1 AND org_id = $2 RETURNING id',
        [tierId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Tier not found' });
      res.json({ ok: true });
    } catch (e) {
      console.error('❌ DELETE /api/organizational/:slug/membership/tiers/:id:', e.message);
      res.status(500).json({ error: 'Could not delete tier' });
    }
  });

  // GET /api/organizational/:slug/membership/members — list with filters
  router.get('/members', async (req, res) => {
    const orgSlug = req.params.slug;
    const { tier_id, status, search } = req.query;

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      let whereClause = 'm.org_id = $1';
      const values = [orgId];
      let paramIndex = 2;

      if (tier_id) {
        whereClause += ` AND m.tier_id = $${paramIndex}`;
        values.push(tier_id);
        paramIndex++;
      }
      if (status) {
        whereClause += ` AND m.status = $${paramIndex}::membership_status`;
        values.push(status);
        paramIndex++;
      }
      if (search) {
        whereClause += ` AND (m.first_name ILIKE $${paramIndex} OR m.last_name ILIKE $${paramIndex} OR m.email ILIKE $${paramIndex})`;
        values.push(`%${search}%`);
        paramIndex++;
      }

      const r = await pool.query(
        `SELECT ${NP_MEMBER_SELECT_FIELDS}
         FROM org_members m
         LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
         WHERE ${whereClause}
         ORDER BY m.last_name ASC, m.first_name ASC`,
        values
      );
      res.json({ members: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/members:', e.message);
      res.status(500).json({ error: 'Could not load members', members: [] });
    }
  });

  // GET /api/organizational/:slug/membership/members/:id — get member detail
  router.get('/members/:id', async (req, res) => {
    const memberId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    if (!Number.isInteger(memberId) || memberId < 1) return res.status(400).json({ error: 'Invalid member id' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const r = await pool.query(
        `SELECT ${NP_MEMBER_SELECT_FIELDS}
         FROM org_members m
         LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
         WHERE m.id = $1 AND m.org_id = $2
         LIMIT 1`,
        [memberId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Member not found' });
      res.json({ member: r.rows[0] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/members/:id:', e.message);
      res.status(500).json({ error: 'Could not load member' });
    }
  });

  // POST /api/organizational/:slug/membership/members — create member
  router.post('/members', async (req, res) => {
    const orgSlug = req.params.slug;
    const { tier_id, first_name, last_name, email, phone, mailing_address, current_period_start, current_period_end, status, notes } = req.body;
    if (!first_name || !last_name || !email) return res.status(400).json({ error: 'First name, last name, and email required' });
    if (!current_period_start || !current_period_end) {
      return res.status(400).json({ error: 'current_period_start and current_period_end are required' });
    }

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const inserted = await pool.query(
        `INSERT INTO org_members
         (org_id, tier_id, first_name, last_name, email, phone, mailing_address, joined_at, current_period_start, current_period_end, status, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), $8, $9, $10::membership_status, $11)
         RETURNING id`,
        [orgId, tier_id || null, first_name, last_name, email, phone || null, mailing_address || null, current_period_start || null, current_period_end || null, status || 'pending_first_payment', notes || null]
      );
      const r = await pool.query(
        `SELECT ${NP_MEMBER_SELECT_FIELDS}
         FROM org_members m
         LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
         WHERE m.id = $1`,
        [inserted.rows[0].id]
      );
      res.status(201).json({ member: r.rows[0] });
    } catch (e) {
      console.error('❌ POST /api/organizational/:slug/membership/members:', e.message);
      res.status(500).json({ error: 'Could not create member' });
    }
  });

  // PATCH /api/organizational/:slug/membership/members/:id — update member
  router.patch('/members/:id', async (req, res) => {
    const memberId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    const { tier_id, first_name, last_name, email, phone, mailing_address, current_period_start, current_period_end, status, notes } = req.body;
    if (!Number.isInteger(memberId) || memberId < 1) return res.status(400).json({ error: 'Invalid member id' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const updates = [];
      const values = [];
      let paramIndex = 1;

      if (tier_id !== undefined) { updates.push(`tier_id = $${paramIndex}`); values.push(tier_id); paramIndex++; }
      if (first_name !== undefined) { updates.push(`first_name = $${paramIndex}`); values.push(first_name); paramIndex++; }
      if (last_name !== undefined) { updates.push(`last_name = $${paramIndex}`); values.push(last_name); paramIndex++; }
      if (email !== undefined) { updates.push(`email = $${paramIndex}`); values.push(email); paramIndex++; }
      if (phone !== undefined) { updates.push(`phone = $${paramIndex}`); values.push(phone); paramIndex++; }
      if (mailing_address !== undefined) { updates.push(`mailing_address = $${paramIndex}`); values.push(mailing_address); paramIndex++; }
      if (current_period_start !== undefined) { updates.push(`current_period_start = $${paramIndex}`); values.push(current_period_start); paramIndex++; }
      if (current_period_end !== undefined) { updates.push(`current_period_end = $${paramIndex}`); values.push(current_period_end); paramIndex++; }
      if (status !== undefined) { updates.push(`status = $${paramIndex}::membership_status`); values.push(status); paramIndex++; }
      if (notes !== undefined) { updates.push(`notes = $${paramIndex}`); values.push(notes); paramIndex++; }

      if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

      updates.push('updated_at = NOW()');
      values.push(memberId, orgId);

      const updated = await pool.query(
        `UPDATE org_members m
         SET ${updates.join(', ')}
         WHERE m.id = $${paramIndex} AND m.org_id = $${paramIndex + 1}
         RETURNING m.id`,
        values
      );
      if (!updated.rows.length) return res.status(404).json({ error: 'Member not found' });
      const r = await pool.query(
        `SELECT ${NP_MEMBER_SELECT_FIELDS}
         FROM org_members m
         LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
         WHERE m.id = $1`,
        [updated.rows[0].id]
      );
      res.json({ member: r.rows[0] });
    } catch (e) {
      console.error('❌ PATCH /api/organizational/:slug/membership/members/:id:', e.message);
      res.status(500).json({ error: 'Could not update member' });
    }
  });

  // POST /api/organizational/:slug/membership/members/:id/payments — record payment
  router.post('/members/:id/payments', async (req, res) => {
    const memberId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    const { amount_cents, currency, payment_date, period_covered_start, period_covered_end, payment_method, notes } = req.body;
    if (!amount_cents || !payment_date) return res.status(400).json({ error: 'Amount and payment date required' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const memberRes = await pool.query(
        'SELECT id, current_period_start, current_period_end FROM org_members WHERE id = $1 AND org_id = $2 LIMIT 1',
        [memberId, orgId]
      );
      if (!memberRes.rows.length) return res.status(404).json({ error: 'Member not found' });

      // period_covered_start/end are NOT NULL on org_membership_payments. The only caller
      // today (recordPayment()'s single amount prompt) never sends either -- default to the
      // member's own current coverage period rather than letting a NOT NULL violation
      // surface as an opaque 500.
      const periodStart = period_covered_start || memberRes.rows[0].current_period_start;
      const periodEnd = period_covered_end || memberRes.rows[0].current_period_end;
      if (!periodStart || !periodEnd) {
        return res.status(400).json({ error: 'This member has no coverage period set -- provide period_covered_start/end explicitly.' });
      }

      const r = await pool.query(
        `INSERT INTO org_membership_payments
         (member_id, amount_cents, currency, payment_date, period_covered_start, period_covered_end, payment_method, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, amount_cents, currency, payment_date, period_covered_start, period_covered_end, payment_method, notes`,
        [memberId, amount_cents, currency || 'USD', payment_date, periodStart, periodEnd, payment_method || null, notes || null]
      );
      res.status(201).json({ payment: r.rows[0] });
    } catch (e) {
      console.error('❌ POST /api/organizational/:slug/membership/members/:id/payments:', e.message);
      res.status(500).json({ error: 'Could not record payment' });
    }
  });

  // GET /api/organizational/:slug/membership/members/:id/payments — one member's payment history
  router.get('/members/:id/payments', async (req, res) => {
    const memberId = Number.parseInt(req.params.id, 10);
    const orgSlug = req.params.slug;
    if (!Number.isInteger(memberId) || memberId < 1) return res.status(400).json({ error: 'Invalid member id' });

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const memberRes = await pool.query('SELECT id FROM org_members WHERE id = $1 AND org_id = $2 LIMIT 1', [memberId, orgId]);
      if (!memberRes.rows.length) return res.status(404).json({ error: 'Member not found' });

      const r = await pool.query(
        `SELECT id, amount_cents, currency, payment_date, period_covered_start, period_covered_end, payment_method, notes, created_at
         FROM org_membership_payments
         WHERE member_id = $1
         ORDER BY payment_date DESC`,
        [memberId]
      );
      res.json({ payments: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/members/:id/payments:', e.message);
      res.status(500).json({ error: 'Could not load payment history', payments: [] });
    }
  });

  // GET /api/organizational/:slug/membership/payments — org-wide payment history (Payments tab)
  router.get('/payments', async (req, res) => {
    const orgSlug = req.params.slug;

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const r = await pool.query(
        `SELECT mp.id, mp.member_id, m.first_name, m.last_name, mp.amount_cents, mp.currency,
                mp.payment_date, mp.period_covered_start, mp.period_covered_end,
                mp.payment_method, mp.notes, mp.created_at
         FROM org_membership_payments mp
         JOIN org_members m ON m.id = mp.member_id
         WHERE m.org_id = $1
         ORDER BY mp.payment_date DESC`,
        [orgId]
      );
      res.json({ payments: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/payments:', e.message);
      res.status(500).json({ error: 'Could not load payment history', payments: [] });
    }
  });

  // GET /api/organizational/:slug/membership/renewals — upcoming renewals
  router.get('/renewals', async (req, res) => {
    const orgSlug = req.params.slug;
    const { days_ahead } = req.query;

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const daysAhead = Number.parseInt(days_ahead || '30', 10);
      const r = await pool.query(
        `SELECT ${NP_MEMBER_SELECT_FIELDS}
         FROM org_members m
         LEFT JOIN org_membership_tiers t ON t.id = m.tier_id
         WHERE m.org_id = $1
           AND m.status IN ('active', 'grace_period')
           AND m.current_period_end <= NOW() + INTERVAL '1 day' * $2
         ORDER BY m.current_period_end ASC`,
        [orgId, daysAhead]
      );
      res.json({ renewals: r.rows || [] });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/renewals:', e.message);
      res.status(500).json({ error: 'Could not load renewals', renewals: [] });
    }
  });

  // GET /api/organizational/:slug/membership/summary — dashboard summary metrics
  router.get('/summary', async (req, res) => {
    const orgSlug = req.params.slug;

    try {
      const orgRes = await pool.query('SELECT id FROM coop_members WHERE slug = $1 LIMIT 1', [orgSlug]);
      if (!orgRes.rows.length) return res.status(404).json({ error: 'Organization not found' });
      const orgId = orgRes.rows[0].id;
      enterOrgContext(orgId);

      const activeCount = await pool.query('SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status = $2', [orgId, 'active']);
      const lapsedCount = await pool.query('SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status = $2', [orgId, 'lapsed']);
      const graceCount = await pool.query('SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status = $2', [orgId, 'grace_period']);
      const duesYear = await pool.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS sum FROM org_membership_payments p JOIN org_members m ON m.id = p.member_id WHERE m.org_id = $1 AND p.payment_date >= DATE_TRUNC('year', NOW())`, [orgId]);
      const duesMonth = await pool.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS sum FROM org_membership_payments p JOIN org_members m ON m.id = p.member_id WHERE m.org_id = $1 AND p.payment_date >= DATE_TRUNC('month', NOW())`, [orgId]);
      const renewals30 = await pool.query(`SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status IN ('active', 'grace_period') AND current_period_end <= NOW() + INTERVAL '30 days'`, [orgId]);
      const renewals60 = await pool.query(`SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status IN ('active', 'grace_period') AND current_period_end <= NOW() + INTERVAL '60 days'`, [orgId]);
      const renewals90 = await pool.query(`SELECT COUNT(*)::int FROM org_members WHERE org_id = $1 AND status IN ('active', 'grace_period') AND current_period_end <= NOW() + INTERVAL '90 days'`, [orgId]);

      res.json({
        total_active: activeCount.rows[0].count,
        total_lapsed: lapsedCount.rows[0].count,
        total_grace: graceCount.rows[0].count,
        dues_received_year: duesYear.rows[0].sum,
        dues_received_month: duesMonth.rows[0].sum,
        renewals_coming_30_days: renewals30.rows[0].count,
        renewals_coming_60_days: renewals60.rows[0].count,
        renewals_coming_90_days: renewals90.rows[0].count,
      });
    } catch (e) {
      console.error('❌ GET /api/organizational/:slug/membership/summary:', e.message);
      res.status(500).json({ error: 'Could not load summary' });
    }
  });

  return router;
}

module.exports = registerMembershipRoutes;
