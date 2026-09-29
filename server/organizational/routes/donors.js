'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { sendGiftAcknowledgment } = require('../lib/sendGiftAcknowledgment');
const { validateConstituentsRows } = require('../lib/importValidators');
const { FINANCE_ROLES, FUNDRAISING_ROLES } = require('../lib/orgRoles');

const CONSTITUENT_TYPES = new Set(['foundation', 'individual', 'board', 'prospect', 'member_org']);

function csvEscape(v) {
  const s = String(v == null ? '' : v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
const GIFT_TYPES = new Set(['grant', 'donation', 'pledge', 'membership_dues']);
const GIFT_PAYMENT_METHODS = new Set(['check', 'ach', 'wire', 'credit_card', 'cash', 'stripe', 'in_kind', 'other']);
const IN_KIND_VALUATION_METHODS = new Set(['quoted_market_price', 'comparable_sales', 'cost_replacement', 'professional_appraisal', 'donor_stated', 'other']);

function parseAmountCents(body) {
  if (body.amount_cents !== undefined && body.amount_cents !== null && body.amount_cents !== '') {
    const n = Number(body.amount_cents);
    if (!Number.isInteger(n) || n < 0) return { error: 'amount_cents must be a non-negative integer' };
    return { value: n };
  }
  if (body.amount !== undefined && body.amount !== null && String(body.amount).trim() !== '') {
    const x = Number(body.amount);
    if (!Number.isFinite(x) || x < 0) return { error: 'amount must be a non-negative number' };
    return { value: Math.round(x * 100) };
  }
  return { error: 'amount is required' };
}

function rowToConstituent(row) {
  if (!row) return null;
  const totalCents = row.lifetime_giving_cents != null ? Number(row.lifetime_giving_cents) : 0;
  const out = {
    id: row.id,
    org_id: row.org_id,
    type: row.type,
    display_name: row.display_name,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: row.email || null,
    phone: row.phone || null,
    mailing_address: row.mailing_address || null,
    website: row.website || null,
    xero_contact_id: row.xero_contact_id || null,
    notes: row.notes || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    is_active: row.is_active,
    is_donor: row.is_donor,
    is_vendor: row.is_vendor,
    is_customer: row.is_customer,
    lifetime_giving_cents: totalCents,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (row.last_gift_date !== undefined) out.last_gift_date = row.last_gift_date || null;
  if (row.active_grant_count !== undefined) out.active_grant_count = Number(row.active_grant_count) || 0;
  if (row.next_deadline !== undefined) out.next_deadline = row.next_deadline || null;
  if (row.total_awarded_cents !== undefined) out.total_awarded_cents = Number(row.total_awarded_cents) || 0;
  return out;
}

function rowToGift(row) {
  if (!row) return null;
  return {
    id: row.id,
    org_id: row.org_id,
    constituent_id: row.constituent_id != null ? Number(row.constituent_id) : null,
    grant_id: row.grant_id != null ? Number(row.grant_id) : null,
    sponsored_project_id: row.sponsored_project_id != null ? Number(row.sponsored_project_id) : null,
    soft_credit_constituent_id: row.soft_credit_constituent_id != null ? Number(row.soft_credit_constituent_id) : null,
    gift_type: row.gift_type,
    amount_cents: Number(row.amount_cents),
    amount_dollars: Number(row.amount_cents) / 100,
    currency: row.currency,
    received_at: row.received_at,
    payment_method: row.payment_method || null,
    stripe_payment_intent_id: row.stripe_payment_intent_id || null,
    campaign: row.campaign || null,
    acknowledgment_sent_at: row.acknowledgment_sent_at || null,
    receipt_sent_at: row.receipt_sent_at || null,
    notes: row.notes || null,
    recorded_by_user_id: row.recorded_by_user_id != null ? Number(row.recorded_by_user_id) : null,
    posting_status: row.posting_status || 'not_applicable',
    ledger_transaction_id: row.ledger_transaction_id != null ? Number(row.ledger_transaction_id) : null,
    program_id: row.program_id != null ? Number(row.program_id) : null,
    in_kind_description: row.in_kind_description || null,
    in_kind_valuation_method: row.in_kind_valuation_method || null,
    in_kind_fair_value_notes: row.in_kind_fair_value_notes || null,
    in_kind_revenue_account_id: row.in_kind_revenue_account_id != null ? Number(row.in_kind_revenue_account_id) : null,
    in_kind_expense_account_id: row.in_kind_expense_account_id != null ? Number(row.in_kind_expense_account_id) : null,
    total_pledged_cents: row.total_pledged_cents != null ? Number(row.total_pledged_cents) : null,
    is_multi_year_pledge: !!row.is_multi_year_pledge,
    discount_rate_bps: row.discount_rate_bps != null ? Number(row.discount_rate_bps) : null,
    discounted_present_value_cents: row.discounted_present_value_cents != null ? Number(row.discounted_present_value_cents) : null,
    receivable_account_id: row.receivable_account_id != null ? Number(row.receivable_account_id) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** Shared validation for in-kind/pledge fields on gift create+update. Returns { error } or
 * { fields } with the normalized values to write; posting_status is computed here too since
 * it's fully determined by gift_type/payment_method, never client-supplied. */
function parseGiftPostingFields(body, giftType, paymentMethod) {
  const out = {
    in_kind_description: null, in_kind_valuation_method: null, in_kind_fair_value_notes: null,
    in_kind_revenue_account_id: null, in_kind_expense_account_id: null,
    total_pledged_cents: null, is_multi_year_pledge: false, discount_rate_bps: null,
    discounted_present_value_cents: null, receivable_account_id: null,
    program_id: null, posting_status: 'not_applicable',
  };
  if (body.program_id !== undefined && body.program_id !== null && String(body.program_id).trim() !== '') {
    const pid = Number.parseInt(String(body.program_id), 10);
    if (!Number.isInteger(pid) || pid < 1) return { error: 'program_id must be a positive integer' };
    out.program_id = pid;
  }

  if (paymentMethod === 'in_kind') {
    out.in_kind_description = body.in_kind_description ? String(body.in_kind_description).trim() : '';
    if (!out.in_kind_description) return { error: 'in_kind_description is required for in-kind gifts' };
    out.in_kind_valuation_method = body.in_kind_valuation_method ? String(body.in_kind_valuation_method).trim() : '';
    if (!IN_KIND_VALUATION_METHODS.has(out.in_kind_valuation_method)) {
      return { error: 'in_kind_valuation_method is required for in-kind gifts and must be one of ' + [...IN_KIND_VALUATION_METHODS].join(', ') };
    }
    out.in_kind_fair_value_notes = body.in_kind_fair_value_notes ? String(body.in_kind_fair_value_notes).trim() || null : null;
    if (body.in_kind_revenue_account_id != null && body.in_kind_revenue_account_id !== '') {
      out.in_kind_revenue_account_id = Number.parseInt(String(body.in_kind_revenue_account_id), 10);
    }
    if (body.in_kind_expense_account_id != null && body.in_kind_expense_account_id !== '') {
      out.in_kind_expense_account_id = Number.parseInt(String(body.in_kind_expense_account_id), 10);
    }
    out.posting_status = 'unposted';
  }

  // Cash grant gifts (gift_type = grant, not in-kind): a real pending record, not a CRM-only
  // entry with no path to the ledger. Matched against the actual bank deposit later in Bank
  // Reconciliation (see grantGiftPayment.js) -- program_id defaults from the grant's own
  // primary_program_id when not set explicitly, filled in by the caller (has DB access this
  // pure function doesn't).
  if (giftType === 'grant' && paymentMethod !== 'in_kind') {
    out.posting_status = 'unposted';
  }

  if (giftType === 'pledge') {
    if (body.total_pledged_cents != null && body.total_pledged_cents !== '') {
      const n = Number.parseInt(String(body.total_pledged_cents), 10);
      if (!Number.isInteger(n) || n <= 0) return { error: 'total_pledged_cents must be a positive integer' };
      out.total_pledged_cents = n;
    } else if (body.total_pledged != null && String(body.total_pledged).trim() !== '') {
      const x = Number(body.total_pledged);
      if (!Number.isFinite(x) || x <= 0) return { error: 'total_pledged must be a positive number' };
      out.total_pledged_cents = Math.round(x * 100);
    } else {
      return { error: 'total_pledged_cents is required for pledges' };
    }
    out.is_multi_year_pledge = body.is_multi_year_pledge === true || body.is_multi_year_pledge === 'true';
    if (out.is_multi_year_pledge) {
      const rateBps = Number.parseInt(String(body.discount_rate_bps), 10);
      if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 5000) {
        return { error: 'discount_rate_bps (0-5000) is required for multi-year pledges' };
      }
      out.discount_rate_bps = rateBps;
      const years = Number(body.pledge_years);
      if (!Number.isFinite(years) || years <= 0) {
        return { error: 'pledge_years is required for multi-year pledges (used to compute present value)' };
      }
      // Simple annual discounting: PV = FV / (1 + r)^years. Final PV always recomputed here
      // server-side, never trusted from a client-supplied number.
      out.discounted_present_value_cents = Math.round(out.total_pledged_cents / Math.pow(1 + rateBps / 10000, years));
    } else {
      out.discounted_present_value_cents = out.total_pledged_cents;
    }
    if (body.receivable_account_id != null && body.receivable_account_id !== '') {
      out.receivable_account_id = Number.parseInt(String(body.receivable_account_id), 10);
    }
    out.posting_status = 'unposted';
  }

  return { fields: out };
}

function registerOrganizationalDonorRoutes(app, pool) {
  const auth = requireAuth(pool);
  // Donor/gift/campaign data has no program dimension (permissions matrix finalized
  // 2026-09-21, .claude/plans/2026-09-19-solid-odi-demo-readiness.md) -- restricted to
  // admin/finance/fundraising, not 'program' (which would otherwise see every donor in the
  // org unfiltered, since there's no per-program column here to restrict by).
  const orgAuth = [
    auth,
    requireOrganizationalAccess,
    requireOrgMembership(pool),
    requireOrgRole(['admin', ...FINANCE_ROLES, ...FUNDRAISING_ROLES]),
  ];
  // Bulk export/import of constituent PII stays admin/finance-only for now -- narrower than
  // general donor access, matching the original higher-trust designation for bulk PII
  // operations rather than assuming fundraising should automatically get it too.
  const orgAuthBulkPii = [...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES])];

  // --- DISTINCT CONSTITUENT TAGS (for filter/autocomplete) ---
  app.get('/api/organizational/orgs/:slug/constituents/tags', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT DISTINCT unnest(tags) AS tag FROM org_constituents
         WHERE org_id = $1 AND tags IS NOT NULL ORDER BY tag`,
        [orgId]
      );
      return res.json(r.rows.map(row => row.tag));
    } catch (e) {
      console.error('GET constituents/tags:', e.message);
      return res.status(500).json({ error: 'Could not load tags' });
    }
  });

  // --- CONSTITUENT LIST ---
  app.get('/api/organizational/orgs/:slug/constituents', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

      const tab = String(req.query.tab || '').trim().toLowerCase();
      const isInstitutions = tab === 'institutions';

      const conditions = ['c.org_id = $1'];
      const params = [orgId];

      const activeParam = String(req.query.active || 'true').toLowerCase();
      if (activeParam !== 'all') {
        conditions.push(`c.is_active = $${params.length + 1}`);
        params.push(activeParam !== 'false');
      }

      if (isInstitutions) {
        conditions.push(`c.type IN ('foundation','member_org','prospect')`);
      } else if (req.query.type) {
        const t = String(req.query.type).trim();
        if (!CONSTITUENT_TYPES.has(t)) return res.status(400).json({ error: 'Invalid type' });
        conditions.push(`c.type = $${params.length + 1}`);
        params.push(t);
      }

      // Role filter for Bills/Invoices contact pickers -- same underlying constituent list,
      // filtered server-side rather than a second, separate picker endpoint.
      const role = String(req.query.role || '').trim().toLowerCase();
      if (role === 'vendor') conditions.push('c.is_vendor IS TRUE');
      else if (role === 'customer') conditions.push('c.is_customer IS TRUE');
      else if (role === 'donor') conditions.push('c.is_donor IS TRUE');

      if (req.query.q) {
        const q = `%${String(req.query.q).trim()}%`;
        conditions.push(`(c.display_name ILIKE $${params.length + 1} OR c.email ILIKE $${params.length + 1})`);
        params.push(q);
      }

      // Tag overlap filter: ?tags=foo,bar → c.tags && '{foo,bar}'
      if (req.query.tags) {
        const tagList = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length) {
          conditions.push(`c.tags && $${params.length + 1}`);
          params.push(tagList);
        }
      }

      const whereClause = conditions.join(' AND ');

      let r;
      if (isInstitutions) {
        r = await pool.query(
          `SELECT c.*,
                  COALESCE(SUM(gift.amount_cents), 0) AS lifetime_giving_cents,
                  COUNT(gr.id) FILTER (WHERE gr.status NOT IN ('declined','closed'))
                    AS active_grant_count,
                  MIN(LEAST(gr.next_report_due, gr.renewal_application_due))
                    FILTER (WHERE LEAST(gr.next_report_due, gr.renewal_application_due) >= CURRENT_DATE)
                    AS next_deadline,
                  COALESCE(SUM(gr.amount_cents) FILTER (WHERE gr.status NOT IN ('declined')), 0)
                    AS total_awarded_cents
           FROM org_constituents c
           LEFT JOIN org_gifts gift ON gift.constituent_id = c.id
           LEFT JOIN org_grants gr ON gr.constituent_id = c.id AND gr.org_id = c.org_id
           WHERE ${whereClause}
           GROUP BY c.id
           ORDER BY c.display_name ASC`,
          params
        );
      } else {
        r = await pool.query(
          `SELECT c.*,
                  COALESCE(SUM(g.amount_cents), 0) AS lifetime_giving_cents,
                  MAX(g.received_at) AS last_gift_date
           FROM org_constituents c
           LEFT JOIN org_gifts g ON g.constituent_id = c.id
           WHERE ${whereClause}
           GROUP BY c.id
           ORDER BY c.display_name ASC`,
          params
        );
      }
      return res.json(r.rows.map(rowToConstituent));
    } catch (e) {
      console.error('GET constituents:', e.message);
      return res.status(500).json({ error: 'Could not load constituents' });
    }
  });

  // --- CONSTITUENT GET ONE ---
  app.get('/api/organizational/orgs/:slug/constituents/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT c.*,
                COALESCE(SUM(g.amount_cents), 0) AS lifetime_giving_cents
         FROM org_constituents c
         LEFT JOIN org_gifts g ON g.constituent_id = c.id
         WHERE c.id = $1 AND c.org_id = $2
         GROUP BY c.id
         LIMIT 1`,
        [constituentId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      return res.json(rowToConstituent(r.rows[0]));
    } catch (e) {
      console.error('GET constituent:', e.message);
      return res.status(500).json({ error: 'Could not load constituent' });
    }
  });

  // --- CONSTITUENT CREATE ---
  app.post('/api/organizational/orgs/:slug/constituents', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const displayName = String(body.display_name || '').trim();
      if (!displayName) return res.status(400).json({ error: 'display_name is required' });

      const type = String(body.type || 'individual').trim();
      if (!CONSTITUENT_TYPES.has(type)) return res.status(400).json({ error: 'Invalid type' });

      const xeroContactId = body.xero_contact_id ? String(body.xero_contact_id).trim() || null : null;

      const tags = Array.isArray(body.tags)
        ? body.tags.map(t => String(t).trim()).filter(Boolean)
        : null;

      const r = await pool.query(
        `INSERT INTO org_constituents
           (org_id, type, display_name, first_name, last_name, email, phone,
            mailing_address, website, xero_contact_id, notes, tags, is_active,
            is_donor, is_vendor, is_customer)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true,$13,$14,$15)
         RETURNING *`,
        [
          orgId, type, displayName,
          body.first_name ? String(body.first_name).trim() || null : null,
          body.last_name ? String(body.last_name).trim() || null : null,
          body.email ? String(body.email).trim() || null : null,
          body.phone ? String(body.phone).trim() || null : null,
          body.mailing_address ? String(body.mailing_address).trim() || null : null,
          body.website ? String(body.website).trim() || null : null,
          xeroContactId,
          body.notes ? String(body.notes).trim() || null : null,
          tags && tags.length ? tags : null,
          body.is_donor !== undefined ? Boolean(body.is_donor) : false,
          body.is_vendor !== undefined ? Boolean(body.is_vendor) : false,
          body.is_customer !== undefined ? Boolean(body.is_customer) : false,
        ]
      );
      const row = { ...r.rows[0], lifetime_giving_cents: 0 };
      return res.status(201).json(rowToConstituent(row));
    } catch (e) {
      if (e.constraint === 'idx_coop_constituents_xero_unique') {
        return res.status(409).json({ error: 'Another constituent is already linked to that Xero contact' });
      }
      console.error('POST constituent:', e.message);
      return res.status(500).json({ error: 'Could not create constituent' });
    }
  });

  // --- CONSTITUENT UPDATE ---
  app.patch('/api/organizational/orgs/:slug/constituents/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const existing = await pool.query(
        'SELECT * FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1',
        [constituentId, orgId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      const row = existing.rows[0];

      const type = body.type !== undefined ? String(body.type).trim() : row.type;
      if (!CONSTITUENT_TYPES.has(type)) return res.status(400).json({ error: 'Invalid type' });

      const displayName = body.display_name !== undefined ? String(body.display_name).trim() : row.display_name;
      if (!displayName) return res.status(400).json({ error: 'display_name cannot be empty' });

      const xeroContactId = body.xero_contact_id !== undefined
        ? (body.xero_contact_id ? String(body.xero_contact_id).trim() || null : null)
        : row.xero_contact_id;

      const newTags = body.tags !== undefined
        ? (Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : null)
        : (Array.isArray(row.tags) ? row.tags : null);

      const r = await pool.query(
        `UPDATE org_constituents SET
           type = $1, display_name = $2, first_name = $3, last_name = $4,
           email = $5, phone = $6, mailing_address = $7, website = $8,
           xero_contact_id = $9, notes = $10, is_active = $11, tags = $12,
           is_donor = $13, is_vendor = $14, is_customer = $15
         WHERE id = $16 AND org_id = $17
         RETURNING *`,
        [
          type, displayName,
          body.first_name !== undefined ? String(body.first_name || '').trim() || null : row.first_name,
          body.last_name !== undefined ? String(body.last_name || '').trim() || null : row.last_name,
          body.email !== undefined ? String(body.email || '').trim() || null : row.email,
          body.phone !== undefined ? String(body.phone || '').trim() || null : row.phone,
          body.mailing_address !== undefined ? String(body.mailing_address || '').trim() || null : row.mailing_address,
          body.website !== undefined ? String(body.website || '').trim() || null : row.website,
          xeroContactId,
          body.notes !== undefined ? String(body.notes || '').trim() || null : row.notes,
          body.is_active !== undefined ? Boolean(body.is_active) : row.is_active,
          newTags && newTags.length ? newTags : null,
          body.is_donor !== undefined ? Boolean(body.is_donor) : row.is_donor,
          body.is_vendor !== undefined ? Boolean(body.is_vendor) : row.is_vendor,
          body.is_customer !== undefined ? Boolean(body.is_customer) : row.is_customer,
          constituentId, orgId,
        ]
      );
      const lifetimeR = await pool.query(
        'SELECT COALESCE(SUM(amount_cents),0) AS lifetime_giving_cents FROM org_gifts WHERE constituent_id = $1',
        [constituentId]
      );
      const updated = { ...r.rows[0], lifetime_giving_cents: Number(lifetimeR.rows[0].lifetime_giving_cents) };
      return res.json(rowToConstituent(updated));
    } catch (e) {
      if (e.constraint === 'idx_coop_constituents_xero_unique') {
        return res.status(409).json({ error: 'Another constituent is already linked to that Xero contact' });
      }
      console.error('PATCH constituent:', e.message);
      return res.status(500).json({ error: 'Could not update constituent' });
    }
  });

  // --- CONSTITUENT ARCHIVE (soft) OR PERMANENT DELETE ---
  // DELETE ?permanent=true → hard-delete, only if no gift or interaction history (409 otherwise)
  // DELETE (default)       → archive: set is_active = false
  app.delete('/api/organizational/orgs/:slug/constituents/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    const permanent = req.query.permanent === 'true';
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      if (permanent) {
        const check = await pool.query(
          `SELECT (SELECT COUNT(*) FROM org_gifts WHERE constituent_id = $1 AND org_id = $2)
                + (SELECT COUNT(*) FROM org_constituent_interactions WHERE constituent_id = $1 AND org_id = $2)
                AS total`,
          [constituentId, orgId]
        );
        if (Number(check.rows[0].total) > 0) {
          return res.status(409).json({ error: 'This donor has gift or interaction history — use Archive instead.' });
        }
        await pool.query('DELETE FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, orgId]);
        return res.json({ ok: true, deleted: true });
      }
      const r = await pool.query(
        'UPDATE org_constituents SET is_active = false WHERE id = $1 AND org_id = $2 RETURNING id',
        [constituentId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE constituent:', e.message);
      return res.status(500).json({ error: 'Could not remove constituent' });
    }
  });

  // --- GIVING HISTORY (constituent: gifts + membership dues unified) ---
  app.get('/api/organizational/orgs/:slug/constituents/:id/gifts', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;

      const constituentCheck = await pool.query(
        'SELECT email FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1',
        [constituentId, orgId]
      );
      if (!constituentCheck.rows.length) return res.status(404).json({ error: 'Constituent not found' });

      const r = await pool.query(
        `SELECT id, org_id, constituent_id, grant_id, soft_credit_constituent_id,
                gift_type, amount_cents, currency, received_at, payment_method,
                stripe_payment_intent_id, campaign, acknowledgment_sent_at, receipt_sent_at,
                notes, recorded_by_user_id, created_at, updated_at,
                'gift' AS source
         FROM org_gifts
         WHERE constituent_id = $1
         ORDER BY received_at DESC`,
        [constituentId]
      );

      // Join membership dues for display if constituent email matches a member record
      const email = constituentCheck.rows[0].email;
      let dues = [];
      if (email) {
        const duesR = await pool.query(
          `SELECT mp.id, mp.amount_cents, mp.currency, mp.payment_date AS received_at,
                  mp.payment_method, mp.notes, mp.created_at
           FROM org_membership_payments mp
           INNER JOIN org_members m ON m.id = mp.member_id
           WHERE m.org_id = $1 AND LOWER(m.email) = LOWER($2)
           ORDER BY mp.payment_date DESC`,
          [orgId, email]
        );
        dues = duesR.rows.map(d => ({
          ...d,
          gift_type: 'membership_dues',
          source: 'membership_dues',
          amount_dollars: Number(d.amount_cents) / 100,
        }));
      }

      const gifts = r.rows.map(row => ({ ...rowToGift(row), source: 'gift' }));
      const combined = [...gifts, ...dues].sort((a, b) =>
        new Date(b.received_at) - new Date(a.received_at)
      );
      return res.json(combined);
    } catch (e) {
      console.error('GET constituent gifts:', e.message);
      return res.status(500).json({ error: 'Could not load giving history' });
    }
  });

  // --- GIFT CREATE ---
  app.post('/api/organizational/orgs/:slug/gifts', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const amountResult = parseAmountCents(body);
      if (amountResult.error) return res.status(400).json({ error: amountResult.error });

      const giftType = String(body.gift_type || 'donation').trim();
      if (!GIFT_TYPES.has(giftType)) return res.status(400).json({ error: 'Invalid gift_type' });

      const paymentMethod = body.payment_method ? String(body.payment_method).trim() : null;
      if (paymentMethod && !GIFT_PAYMENT_METHODS.has(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid payment_method' });
      }

      const constituentId = body.constituent_id != null ? Number(body.constituent_id) : null;
      const grantId = body.grant_id != null ? Number(body.grant_id) : null;
      const sponsoredProjectId = body.sponsored_project_id != null ? Number(body.sponsored_project_id) : null;
      const softCreditId = body.soft_credit_constituent_id != null ? Number(body.soft_credit_constituent_id) : null;
      const receivedAt = body.received_at ? new Date(body.received_at) : new Date();
      if (isNaN(receivedAt.getTime())) return res.status(400).json({ error: 'Invalid received_at date' });
      if (sponsoredProjectId != null) {
        const spR = await pool.query(
          'SELECT id FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1',
          [sponsoredProjectId, orgId]
        );
        if (!spR.rows.length) return res.status(400).json({ error: 'sponsored_project_id does not belong to this organization' });
      }

      const posting = parseGiftPostingFields(body, giftType, paymentMethod);
      if (posting.error) return res.status(400).json({ error: posting.error });
      const pf = posting.fields;

      if (pf.program_id == null && giftType === 'grant' && grantId != null) {
        const gpR = await pool.query('SELECT primary_program_id FROM org_grants WHERE id = $1 AND org_id = $2 LIMIT 1', [grantId, orgId]);
        if (gpR.rows.length && gpR.rows[0].primary_program_id != null) pf.program_id = Number(gpR.rows[0].primary_program_id);
      }

      // amount_cents holds what actually posts: for a pledge that's the (possibly discounted)
      // commitment amount, not necessarily the face value the donor promised.
      const amountCents = giftType === 'pledge' ? pf.discounted_present_value_cents : amountResult.value;

      const r = await pool.query(
        `INSERT INTO org_gifts
           (org_id, constituent_id, grant_id, sponsored_project_id, soft_credit_constituent_id,
            gift_type, amount_cents, currency, received_at, payment_method,
            campaign, notes, recorded_by_user_id,
            posting_status, program_id,
            in_kind_description, in_kind_valuation_method, in_kind_fair_value_notes,
            in_kind_revenue_account_id, in_kind_expense_account_id,
            total_pledged_cents, is_multi_year_pledge, discount_rate_bps,
            discounted_present_value_cents, receivable_account_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
         RETURNING *`,
        [
          orgId, constituentId, grantId, sponsoredProjectId, softCreditId,
          giftType, amountCents,
          String(body.currency || 'USD').trim().toUpperCase(),
          receivedAt.toISOString(),
          paymentMethod,
          body.campaign ? String(body.campaign).trim() || null : null,
          body.notes ? String(body.notes).trim() || null : null,
          userId,
          pf.posting_status, pf.program_id,
          pf.in_kind_description, pf.in_kind_valuation_method, pf.in_kind_fair_value_notes,
          pf.in_kind_revenue_account_id, pf.in_kind_expense_account_id,
          pf.total_pledged_cents, pf.is_multi_year_pledge, pf.discount_rate_bps,
          pf.discounted_present_value_cents, pf.receivable_account_id,
        ]
      );
      const gift = r.rows[0];

      if (body.send_acknowledgment && constituentId) {
        const constituentR = await pool.query(
          'SELECT * FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1',
          [constituentId, orgId]
        );
        const orgR = await pool.query(
          'SELECT o.display_name, s.ein, s.reply_to_email FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id WHERE o.id = $1 LIMIT 1',
          [orgId]
        );
        if (constituentR.rows.length && constituentR.rows[0].email && orgR.rows.length) {
          try {
            await sendGiftAcknowledgment(pool, gift, constituentR.rows[0], orgR.rows[0]);
            await pool.query(
              'UPDATE org_gifts SET acknowledgment_sent_at = NOW() WHERE id = $1',
              [gift.id]
            );
            gift.acknowledgment_sent_at = new Date().toISOString();
          } catch (mailErr) {
            console.error('Acknowledgment send failed (gift saved):', mailErr.message);
          }
        }
      }

      return res.status(201).json(rowToGift(gift));
    } catch (e) {
      console.error('POST gift:', e.message);
      return res.status(500).json({ error: 'Could not create gift' });
    }
  });

  // --- GIFT UPDATE ---
  app.patch('/api/organizational/orgs/:slug/gifts/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number(req.params.id);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const existing = await pool.query(
        'SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1',
        [giftId, orgId]
      );
      if (!existing.rows.length) return res.status(404).json({ error: 'Gift not found' });
      const row = existing.rows[0];

      const amountCents = body.amount_cents !== undefined || body.amount !== undefined
        ? (() => { const p = parseAmountCents(body); if (p.error) throw Object.assign(new Error(p.error), { statusCode: 400 }); return p.value; })()
        : Number(row.amount_cents);

      const giftType = body.gift_type !== undefined ? String(body.gift_type).trim() : row.gift_type;
      if (!GIFT_TYPES.has(giftType)) return res.status(400).json({ error: 'Invalid gift_type' });

      const paymentMethod = body.payment_method !== undefined
        ? (body.payment_method ? String(body.payment_method).trim() : null)
        : row.payment_method;
      if (paymentMethod && !GIFT_PAYMENT_METHODS.has(paymentMethod)) {
        return res.status(400).json({ error: 'Invalid payment_method' });
      }

      const sponsoredProjectId = body.sponsored_project_id !== undefined
        ? (body.sponsored_project_id != null ? Number(body.sponsored_project_id) : null)
        : row.sponsored_project_id;
      if (sponsoredProjectId != null && body.sponsored_project_id !== undefined) {
        const spR = await pool.query(
          'SELECT id FROM org_sponsored_projects WHERE id = $1 AND sponsor_org_id = $2 LIMIT 1',
          [sponsoredProjectId, orgId]
        );
        if (!spR.rows.length) return res.status(400).json({ error: 'sponsored_project_id does not belong to this organization' });
      }

      // Once posted, the fields that determined the ledger transaction can no longer change
      // silently -- same "correction needs a new transaction" discipline as Fixed Assets'
      // post-depreciation lock. Void the posting first (POST .../gift-postings/:id/void) to
      // edit and re-post.
      const touchesPostingFields = ['gift_type', 'payment_method', 'amount_cents', 'amount',
        'in_kind_description', 'in_kind_valuation_method', 'in_kind_fair_value_notes',
        'in_kind_revenue_account_id', 'in_kind_expense_account_id', 'program_id',
        'total_pledged_cents', 'total_pledged', 'is_multi_year_pledge', 'discount_rate_bps',
        'pledge_years', 'receivable_account_id'].some((k) => body[k] !== undefined);
      if (touchesPostingFields && row.posting_status === 'posted') {
        return res.status(409).json({ error: 'This gift has already been posted to the ledger -- void the posting first to change gift type, amount, or in-kind/pledge fields.', code: 'already_posted' });
      }

      const posting = parseGiftPostingFields({
        program_id: body.program_id !== undefined ? body.program_id : row.program_id,
        in_kind_description: body.in_kind_description !== undefined ? body.in_kind_description : row.in_kind_description,
        in_kind_valuation_method: body.in_kind_valuation_method !== undefined ? body.in_kind_valuation_method : row.in_kind_valuation_method,
        in_kind_fair_value_notes: body.in_kind_fair_value_notes !== undefined ? body.in_kind_fair_value_notes : row.in_kind_fair_value_notes,
        in_kind_revenue_account_id: body.in_kind_revenue_account_id !== undefined ? body.in_kind_revenue_account_id : row.in_kind_revenue_account_id,
        in_kind_expense_account_id: body.in_kind_expense_account_id !== undefined ? body.in_kind_expense_account_id : row.in_kind_expense_account_id,
        total_pledged_cents: body.total_pledged_cents !== undefined ? body.total_pledged_cents : row.total_pledged_cents,
        total_pledged: body.total_pledged,
        is_multi_year_pledge: body.is_multi_year_pledge !== undefined ? body.is_multi_year_pledge : row.is_multi_year_pledge,
        discount_rate_bps: body.discount_rate_bps !== undefined ? body.discount_rate_bps : row.discount_rate_bps,
        pledge_years: body.pledge_years,
        receivable_account_id: body.receivable_account_id !== undefined ? body.receivable_account_id : row.receivable_account_id,
      }, giftType, paymentMethod);
      if (posting.error) return res.status(400).json({ error: posting.error });
      const pf = posting.fields;
      const finalAmountCents = giftType === 'pledge' ? pf.discounted_present_value_cents : amountCents;

      const patchGrantId = body.grant_id !== undefined ? (body.grant_id != null ? Number(body.grant_id) : null) : row.grant_id;
      if (pf.program_id == null && giftType === 'grant' && patchGrantId != null) {
        const gpR = await pool.query('SELECT primary_program_id FROM org_grants WHERE id = $1 AND org_id = $2 LIMIT 1', [patchGrantId, orgId]);
        if (gpR.rows.length && gpR.rows[0].primary_program_id != null) pf.program_id = Number(gpR.rows[0].primary_program_id);
      }

      const r = await pool.query(
        `UPDATE org_gifts SET
           constituent_id = $1, grant_id = $2, sponsored_project_id = $3, soft_credit_constituent_id = $4,
           gift_type = $5, amount_cents = $6, currency = $7, received_at = $8,
           payment_method = $9, campaign = $10, notes = $11,
           posting_status = $12, program_id = $13,
           in_kind_description = $14, in_kind_valuation_method = $15, in_kind_fair_value_notes = $16,
           in_kind_revenue_account_id = $17, in_kind_expense_account_id = $18,
           total_pledged_cents = $19, is_multi_year_pledge = $20, discount_rate_bps = $21,
           discounted_present_value_cents = $22, receivable_account_id = $23
         WHERE id = $24 AND org_id = $25
         RETURNING *`,
        [
          body.constituent_id !== undefined ? (body.constituent_id != null ? Number(body.constituent_id) : null) : row.constituent_id,
          body.grant_id !== undefined ? (body.grant_id != null ? Number(body.grant_id) : null) : row.grant_id,
          sponsoredProjectId,
          body.soft_credit_constituent_id !== undefined ? (body.soft_credit_constituent_id != null ? Number(body.soft_credit_constituent_id) : null) : row.soft_credit_constituent_id,
          giftType, finalAmountCents,
          body.currency !== undefined ? String(body.currency).trim().toUpperCase() : row.currency,
          body.received_at !== undefined ? new Date(body.received_at).toISOString() : row.received_at,
          paymentMethod,
          body.campaign !== undefined ? String(body.campaign || '').trim() || null : row.campaign,
          body.notes !== undefined ? String(body.notes || '').trim() || null : row.notes,
          pf.posting_status, pf.program_id,
          pf.in_kind_description, pf.in_kind_valuation_method, pf.in_kind_fair_value_notes,
          pf.in_kind_revenue_account_id, pf.in_kind_expense_account_id,
          pf.total_pledged_cents, pf.is_multi_year_pledge, pf.discount_rate_bps,
          pf.discounted_present_value_cents, pf.receivable_account_id,
          giftId, orgId,
        ]
      );
      return res.json(rowToGift(r.rows[0]));
    } catch (e) {
      if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error('PATCH gift:', e.message);
      return res.status(500).json({ error: 'Could not update gift' });
    }
  });

  // --- GIFT DELETE ---
  app.delete('/api/organizational/orgs/:slug/gifts/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number(req.params.id);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const postedR = await pool.query('SELECT posting_status FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1', [giftId, orgId]);
      if (postedR.rows.length && postedR.rows[0].posting_status === 'posted') {
        return res.status(409).json({ error: 'This gift has already been posted to the ledger -- void the posting first before deleting.', code: 'already_posted' });
      }
      const r = await pool.query(
        'DELETE FROM org_gifts WHERE id = $1 AND org_id = $2 RETURNING id',
        [giftId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Gift not found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE gift:', e.message);
      return res.status(500).json({ error: 'Could not delete gift' });
    }
  });

  // --- PLEDGE INSTALLMENTS (tracking-only -- collections post as ordinary bank deposits
  // coded against the pledge's receivable_account_id in Cash Coding/Reconcile, not here) ---
  app.get('/api/organizational/orgs/:slug/gifts/:giftId/installments', ...orgAuth, async (req, res) => {
    const giftId = Number(req.params.giftId);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid gift id' });
    try {
      const r = await pool.query(
        `SELECT i.* FROM org_gift_pledge_installments i
         JOIN org_gifts g ON g.id = i.gift_id
         WHERE i.gift_id = $1 AND g.org_id = $2
         ORDER BY i.due_date ASC`,
        [giftId, req.orgId]
      );
      return res.json({ installments: r.rows.map((row) => ({
        id: row.id, gift_id: row.gift_id, due_date: row.due_date,
        amount_cents: Number(row.amount_cents), status: row.status, notes: row.notes || null,
      })) });
    } catch (e) {
      console.error('GET gift installments:', e.message);
      return res.status(500).json({ error: 'Could not load installments' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gifts/:giftId/installments', ...orgAuth, async (req, res) => {
    const giftId = Number(req.params.giftId);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid gift id' });
    const body = req.body || {};
    const dueDate = body.due_date ? String(body.due_date) : null;
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) return res.status(400).json({ error: 'due_date is required and must be YYYY-MM-DD' });
    const amountCents = Number.parseInt(String(body.amount_cents), 10);
    if (!Number.isInteger(amountCents) || amountCents <= 0) return res.status(400).json({ error: 'amount_cents must be a positive integer' });
    try {
      const giftR = await pool.query(`SELECT id FROM org_gifts WHERE id = $1 AND org_id = $2 AND gift_type = 'pledge' LIMIT 1`, [giftId, req.orgId]);
      if (!giftR.rows.length) return res.status(404).json({ error: 'Pledge gift not found' });
      const r = await pool.query(
        `INSERT INTO org_gift_pledge_installments (org_id, gift_id, due_date, amount_cents, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [req.orgId, giftId, dueDate, amountCents, body.notes ? String(body.notes).trim() || null : null]
      );
      return res.status(201).json({ id: r.rows[0].id });
    } catch (e) {
      console.error('POST gift installment:', e.message);
      return res.status(500).json({ error: 'Could not create installment' });
    }
  });

  app.patch('/api/organizational/orgs/:slug/gifts/:giftId/installments/:id', ...orgAuth, async (req, res) => {
    const installmentId = Number(req.params.id);
    if (!Number.isInteger(installmentId) || installmentId < 1) return res.status(400).json({ error: 'Invalid installment id' });
    const status = req.body && req.body.status != null ? String(req.body.status).trim() : null;
    if (!status || !['expected', 'collected', 'written_off'].includes(status)) {
      return res.status(400).json({ error: 'status must be expected, collected, or written_off' });
    }
    try {
      const r = await pool.query(
        `UPDATE org_gift_pledge_installments SET status = $1 WHERE id = $2 AND org_id = $3 RETURNING id`,
        [status, installmentId, req.orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Installment not found' });
      return res.json({ id: installmentId, status });
    } catch (e) {
      console.error('PATCH gift installment:', e.message);
      return res.status(500).json({ error: 'Could not update installment' });
    }
  });

  // --- ACKNOWLEDGMENT SEND (manual re-trigger) ---
  app.post('/api/organizational/orgs/:slug/gifts/:id/acknowledge', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number(req.params.id);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;

      const giftR = await pool.query(
        'SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 LIMIT 1',
        [giftId, orgId]
      );
      if (!giftR.rows.length) return res.status(404).json({ error: 'Gift not found' });
      const gift = giftR.rows[0];

      if (!gift.constituent_id) return res.status(400).json({ error: 'Gift has no constituent — cannot send acknowledgment' });

      const constituentR = await pool.query(
        'SELECT * FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1',
        [gift.constituent_id, orgId]
      );
      if (!constituentR.rows.length || !constituentR.rows[0].email) {
        return res.status(400).json({ error: 'Constituent has no email address' });
      }

      const orgR = await pool.query(
        'SELECT o.display_name, s.ein, s.reply_to_email FROM coop_members o LEFT JOIN org_settings s ON s.org_id = o.id WHERE o.id = $1 LIMIT 1',
        [orgId]
      );

      await sendGiftAcknowledgment(pool, gift, constituentR.rows[0], orgR.rows[0]);
      await pool.query(
        'UPDATE org_gifts SET acknowledgment_sent_at = NOW() WHERE id = $1',
        [giftId]
      );

      return res.json({ ok: true, sent_to: constituentR.rows[0].email });
    } catch (e) {
      console.error('POST acknowledge:', e.message);
      return res.status(500).json({ error: 'Could not send acknowledgment' });
    }
  });

  // --- GIVING SUMMARY (org-level) ---
  // Distinct campaign values (for giving summary filter dropdown)
  app.get('/api/organizational/orgs/:slug/gifts/campaigns', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        'SELECT DISTINCT campaign FROM org_gifts WHERE org_id = $1 AND campaign IS NOT NULL ORDER BY campaign',
        [orgId]
      );
      return res.json(r.rows.map(row => row.campaign));
    } catch (e) {
      console.error('GET gifts/campaigns:', e.message);
      return res.status(500).json({ error: 'Could not load campaigns' });
    }
  });

  app.get('/api/organizational/orgs/:slug/giving-summary', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

      // Fiscal year filter (optional)
      let dateClause = '';
      const params = [orgId];
      if (req.query.fiscal_year) {
        const fy = String(req.query.fiscal_year).trim();
        const yearMatch = fy.match(/(\d{4})$/);
        if (yearMatch) {
          const year = Number(yearMatch[1]);
          const orgR = await pool.query('SELECT fiscal_year_end_month FROM org_settings WHERE org_id = $1', [orgId]);
          const fyEndMonth = orgR.rows[0]?.fiscal_year_end_month || 12;
          const fyStartYear = fyEndMonth === 12 ? year : year - 1;
          const fyStart = `${fyStartYear}-${String(fyEndMonth === 12 ? 1 : fyEndMonth + 1).padStart(2, '0')}-01`;
          const fyEnd = `${fyEndMonth === 12 ? year : year}-${String(fyEndMonth).padStart(2, '0')}-${fyEndMonth === 12 ? '31' : new Date(year, fyEndMonth, 0).getDate()}`;
          dateClause = ` AND received_at >= $${params.length + 1} AND received_at <= $${params.length + 2}`;
          params.push(fyStart, fyEnd);
        }
      }

      // Campaign filter (optional)
      if (req.query.campaign) {
        dateClause += ` AND campaign = $${params.length + 1}`;
        params.push(String(req.query.campaign).trim());
      }

      const totalsR = await pool.query(
        `SELECT
           COUNT(*) AS total_gifts,
           COUNT(DISTINCT constituent_id) AS total_donors,
           COALESCE(SUM(amount_cents), 0) AS total_gifts_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'grant' THEN amount_cents END), 0) AS grant_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'donation' THEN amount_cents END), 0) AS donation_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'pledge' THEN amount_cents END), 0) AS pledge_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'membership_dues' THEN amount_cents END), 0) AS membership_dues_cents
         FROM org_gifts
         WHERE org_id = $1${dateClause}`,
        params
      );

      const topR = await pool.query(
        `SELECT c.id, c.display_name, COALESCE(SUM(g.amount_cents), 0) AS total_cents
         FROM org_constituents c
         INNER JOIN org_gifts g ON g.constituent_id = c.id
         WHERE g.org_id = $1${dateClause}
         GROUP BY c.id, c.display_name
         ORDER BY total_cents DESC
         LIMIT 10`,
        params
      );

      const t = totalsR.rows[0];
      return res.json({
        total_gifts_cents: Number(t.total_gifts_cents),
        total_gifts: Number(t.total_gifts),
        total_donors: Number(t.total_donors),
        avg_gift_cents: Number(t.total_gifts) > 0 ? Math.round(Number(t.total_gifts_cents) / Number(t.total_gifts)) : 0,
        gifts_by_type: {
          grant: Number(t.grant_cents),
          donation: Number(t.donation_cents),
          pledge: Number(t.pledge_cents),
          membership_dues: Number(t.membership_dues_cents),
        },
        top_constituents: topR.rows.map(r => ({
          id: r.id,
          display_name: r.display_name,
          total_cents: Number(r.total_cents),
        })),
      });
    } catch (e) {
      console.error('GET giving-summary:', e.message);
      return res.status(500).json({ error: 'Could not load giving summary' });
    }
  });

  // --- UNLINKED GRANTS QUEUE ---
  app.get('/api/organizational/orgs/:slug/grants/unlinked', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT id, name, funder, amount_cents, status, start_date::text AS start_date
         FROM org_grants
         WHERE org_id = $1 AND constituent_id IS NULL
         ORDER BY start_date DESC NULLS LAST, id DESC`,
        [orgId]
      );
      return res.json(r.rows);
    } catch (e) {
      console.error('GET grants/unlinked:', e.message);
      return res.status(500).json({ error: 'Could not load unlinked grants' });
    }
  });

  // --- GRANTS FOR A CONSTITUENT (funder view) ---
  app.get('/api/organizational/orgs/:slug/constituents/:id/grants', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT g.id, g.name, g.funder, g.grant_code, g.status, g.grant_type,
                g.amount_cents, g.request_amount_cents,
                g.start_date::text AS start_date, g.end_date::text AS end_date,
                g.period_start_date::text AS period_start_date,
                g.period_end_date::text AS period_end_date,
                g.loi_submitted_at::text AS loi_submitted_at,
                g.application_submitted_at::text AS application_submitted_at,
                g.award_date::text AS award_date,
                g.next_report_due::text AS next_report_due,
                g.renewal_application_due::text AS renewal_application_due,
                g.revenue_account_id,
                g.allocation_mode,
                COALESCE((SELECT SUM(ga.amount_cents) FROM org_grant_allocations ga WHERE ga.grant_id = g.id), 0)
                  AS allocated_cents
         FROM org_grants g
         WHERE g.constituent_id = $1 AND g.org_id = $2
         ORDER BY g.start_date DESC NULLS LAST, g.id DESC`,
        [constituentId, orgId]
      );
      return res.json(r.rows);
    } catch (e) {
      console.error('GET constituent grants:', e.message);
      return res.status(500).json({ error: 'Could not load constituent grants' });
    }
  });

  // --- FUNDER DASHBOARD ---
  app.get('/api/organizational/orgs/:slug/donors/dashboard', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

      const [statsR, pipelineR, upcomingR] = await Promise.all([
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status NOT IN ('declined','closed')) AS active_grant_count,
             COUNT(DISTINCT constituent_id) FILTER (WHERE constituent_id IS NOT NULL) AS funder_count,
             COALESCE(SUM(amount_cents) FILTER (WHERE status NOT IN ('declined','closed')), 0)
               AS total_active_cents,
             COUNT(*) FILTER (WHERE next_report_due BETWEEN CURRENT_DATE AND CURRENT_DATE + 60) AS pending_report_count
           FROM org_grants
           WHERE org_id = $1`,
          [orgId]
        ),
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE status = 'prospect') AS prospecting,
             COUNT(*) FILTER (WHERE status = 'applied') AS submitted,
             COUNT(*) FILTER (WHERE status = 'awarded') AS active,
             COUNT(*) FILTER (WHERE status = 'awarded' AND next_report_due BETWEEN CURRENT_DATE AND CURRENT_DATE + 30) AS reporting
           FROM org_grants
           WHERE org_id = $1`,
          [orgId]
        ),
        pool.query(
          `SELECT g.id AS grant_id, g.name AS grant_name,
                  c.display_name AS funder_name,
                  g.funder AS funder_text,
                  LEAST(g.next_report_due, g.renewal_application_due)::text AS due_date,
                  CASE
                    WHEN g.next_report_due IS NOT NULL AND
                         (g.renewal_application_due IS NULL OR g.next_report_due <= g.renewal_application_due)
                    THEN 'report'
                    ELSE 'renewal'
                  END AS due_type
           FROM org_grants g
           LEFT JOIN org_constituents c ON c.id = g.constituent_id
           WHERE g.org_id = $1
             AND LEAST(g.next_report_due, g.renewal_application_due)
                 BETWEEN CURRENT_DATE AND CURRENT_DATE + 60
           ORDER BY LEAST(g.next_report_due, g.renewal_application_due) ASC
           LIMIT 10`,
          [orgId]
        ),
      ]);

      const s = statsR.rows[0];
      const p = pipelineR.rows[0];
      return res.json({
        stats: {
          active_grant_count: Number(s.active_grant_count),
          funder_count: Number(s.funder_count),
          total_active_cents: Number(s.total_active_cents),
          pending_report_count: Number(s.pending_report_count),
        },
        pipeline: {
          prospecting: Number(p.prospecting),
          submitted: Number(p.submitted),
          active: Number(p.active),
          reporting: Number(p.reporting),
        },
        upcoming: upcomingR.rows,
      });
    } catch (e) {
      console.error('GET donors/dashboard:', e.message);
      return res.status(500).json({ error: 'Could not load dashboard' });
    }
  });

  // --- INTERACTION LOG: LIST ---
  app.get('/api/organizational/orgs/:slug/constituents/:id/interactions', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT i.id, i.constituent_id, i.grant_id, i.interaction_type, i.interaction_date::text,
                i.description, i.recorded_by, i.created_at,
                u.email AS recorded_by_email,
                g.name AS grant_name
         FROM org_constituent_interactions i
         LEFT JOIN users u ON u.id = i.recorded_by
         LEFT JOIN org_grants g ON g.id = i.grant_id
         WHERE i.org_id = $1 AND i.constituent_id = $2
         ORDER BY i.interaction_date DESC, i.created_at DESC`,
        [orgId, constituentId]
      );
      return res.json(r.rows);
    } catch (e) {
      console.error('GET interactions:', e.message);
      return res.status(500).json({ error: 'Could not load interactions' });
    }
  });

  // --- INTERACTION LOG: CREATE ---
  app.post('/api/organizational/orgs/:slug/constituents/:id/interactions', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const INTERACTION_TYPES = new Set(['meeting','call','email','note','site_visit']);
      const interactionType = String(body.interaction_type || 'note').toLowerCase();
      if (!INTERACTION_TYPES.has(interactionType)) return res.status(400).json({ error: 'Invalid interaction_type' });

      const description = String(body.description || '').trim();
      if (!description) return res.status(400).json({ error: 'description is required' });

      const interactionDate = body.interaction_date ? String(body.interaction_date).trim() : new Date().toISOString().slice(0, 10);

      let grantId = null;
      if (body.grant_id != null && String(body.grant_id).trim() !== '') {
        grantId = Number(body.grant_id);
        if (!Number.isInteger(grantId) || grantId < 1) return res.status(400).json({ error: 'Invalid grant_id' });
      }

      const r = await pool.query(
        `INSERT INTO org_constituent_interactions
           (org_id, constituent_id, grant_id, interaction_type, interaction_date, description, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, constituent_id, grant_id, interaction_type, interaction_date::text,
                   description, recorded_by, created_at`,
        [orgId, constituentId, grantId, interactionType, interactionDate, description, userId]
      );
      return res.status(201).json(r.rows[0]);
    } catch (e) {
      console.error('POST interaction:', e.message);
      return res.status(500).json({ error: 'Could not create interaction' });
    }
  });

  // --- INTERACTION LOG: DELETE ---
  app.delete('/api/organizational/orgs/:slug/interactions/:id', ...orgAuth, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const interactionId = Number(req.params.id);
    if (!Number.isInteger(interactionId) || interactionId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        'DELETE FROM org_constituent_interactions WHERE id = $1 AND org_id = $2 RETURNING id',
        [interactionId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Interaction not found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('DELETE interaction:', e.message);
      return res.status(500).json({ error: 'Could not delete interaction' });
    }
  });

  // --- CONSTITUENT MAIL-MERGE EXPORT ---
  app.get('/api/organizational/orgs/:slug/constituents/export.csv', ...orgAuthBulkPii, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

      const conditions = ['c.org_id = $1'];
      const params = [orgId];

      const activeParam = String(req.query.active || 'true').toLowerCase();
      if (activeParam !== 'all') {
        conditions.push(`c.is_active = $${params.length + 1}`);
        params.push(activeParam !== 'false');
      }
      if (req.query.type && CONSTITUENT_TYPES.has(String(req.query.type).trim())) {
        conditions.push(`c.type = $${params.length + 1}`);
        params.push(String(req.query.type).trim());
      }
      if (req.query.tags) {
        const tagList = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
        if (tagList.length) { conditions.push(`c.tags && $${params.length + 1}`); params.push(tagList); }
      }

      const r = await pool.query(
        `SELECT c.first_name, c.last_name, c.display_name, c.email, c.mailing_address, c.type, c.tags
         FROM org_constituents c WHERE ${conditions.join(' AND ')} ORDER BY c.display_name ASC`,
        params
      );

      function csvRow(cells) { return cells.map(csvEscape).join(',') + '\r\n'; }
      let csv = csvRow(['first_name','last_name','display_name','email','mailing_address','type','tags']);
      for (const row of r.rows) {
        csv += csvRow([
          row.first_name || '',
          row.last_name || '',
          row.display_name || '',
          row.email || '',
          row.mailing_address || '',
          row.type || '',
          Array.isArray(row.tags) ? row.tags.join(';') : '',
        ]);
      }

      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="funders-export-${date}.csv"`);
      return res.send(csv);
    } catch (e) {
      console.error('GET constituents/export.csv:', e.message);
      return res.status(500).json({ error: 'Export failed' });
    }
  });

  // --- CONSTITUENT CSV IMPORT (JSON-mapped) ---
  app.post('/api/organizational/orgs/:slug/import/constituents/json', ...orgAuthBulkPii, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return res.status(400).json({ error: 'No rows provided' });

      const { errors, normalized } = validateConstituentsRows(rows);
      if (errors.length) return res.status(422).json({ errors, inserted: 0, updated: 0 });

      // Load existing constituents for dedupe (email-first, display_name-fallback)
      const existingR = await pool.query(
        'SELECT id, LOWER(email) AS le, LOWER(display_name) AS ldn FROM org_constituents WHERE org_id = $1',
        [orgId]
      );
      const byEmail = new Map(existingR.rows.filter(r => r.le).map(r => [r.le, r.id]));
      const byName  = new Map(existingR.rows.map(r => [r.ldn, r.id]));

      let inserted = 0;
      let updated  = 0;
      const rowErrors = [];

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (let i = 0; i < normalized.length; i++) {
          const rec = normalized[i];
          try {
            const emailKey = rec.email ? rec.email.toLowerCase() : null;
            const nameKey  = rec.display_name.toLowerCase();
            const existingId = (emailKey && byEmail.get(emailKey)) || byName.get(nameKey) || null;

            if (existingId) {
              await client.query(
                `UPDATE org_constituents SET
                   display_name = $1, type = $2, email = $3, phone = $4,
                   mailing_address = $5, website = $6, notes = $7,
                   tags = COALESCE($8, tags)
                 WHERE id = $9 AND org_id = $10`,
                [
                  rec.display_name, rec.type, rec.email, rec.phone,
                  rec.mailing_address, rec.website, rec.notes,
                  rec.tags && rec.tags.length ? rec.tags : null,
                  existingId, orgId,
                ]
              );
              updated += 1;
            } else {
              const nr = await client.query(
                `INSERT INTO org_constituents
                   (org_id, type, display_name, email, phone, mailing_address, website, notes, tags, is_active)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true) RETURNING id`,
                [
                  orgId, rec.type, rec.display_name, rec.email, rec.phone,
                  rec.mailing_address, rec.website, rec.notes,
                  rec.tags && rec.tags.length ? rec.tags : null,
                ]
              );
              // Cache new entry for subsequent deduplication within same import batch
              const newId = nr.rows[0].id;
              if (emailKey) byEmail.set(emailKey, newId);
              byName.set(nameKey, newId);
              inserted += 1;
            }
          } catch (rowErr) {
            rowErrors.push({ row: i + 1, error: rowErr.message });
          }
        }
        if (rowErrors.length) {
          await client.query('ROLLBACK');
          return res.status(422).json({ errors: rowErrors, inserted: 0, updated: 0 });
        }
        await client.query('COMMIT');
        return res.json({ inserted, updated, errors: [] });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (e) {
      console.error('POST import/constituents/json:', e.message);
      return res.status(500).json({ error: 'Import failed: ' + e.message });
    }
  });
}

module.exports = { registerOrganizationalDonorRoutes };
