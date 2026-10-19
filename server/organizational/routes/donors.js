'use strict';

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireDonorRead, requireContactRead, boardSeesAllPrograms } = require('../middleware/requireAccountingAccess');
const { requireContactWrite } = require('../middleware/requireWriteAccess');
const { sendGiftAcknowledgment } = require('../lib/sendGiftAcknowledgment');
const { logAudit, reqMeta, diffFields } = require('../lib/auditLog');
const { validateConstituentsRows } = require('../lib/importValidators');
const { FINANCE_ROLES, FUNDRAISING_ROLES } = require('../lib/orgRoles');

const {
  CONTACT_ROLES, ROLES_SELECT, hasRoleCondition, parseRoles, parseKindFields, addContactRoles, setContactRoles,
} = require('../lib/contactRoles');

function parseEmails(v) {
  if (v === undefined) return undefined;
  const list = Array.isArray(v) ? v : String(v || '').split(/[,;\n]+/);
  const out = [];
  for (const e of list) {
    const t = String(e).trim();
    if (t && /^[^\s@]+@[^\s@]+$/.test(t) && !out.some(x => x.toLowerCase() === t.toLowerCase())) out.push(t);
  }
  return out.length ? out : null;
}

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
    kind: row.kind,
    org_type: row.org_type || null,
    roles: Array.isArray(row.roles) ? row.roles : [],
    display_name: row.display_name,
    first_name: row.first_name || null,
    last_name: row.last_name || null,
    email: row.email || null,
    additional_emails: Array.isArray(row.additional_emails) ? row.additional_emails : [],
    phone: row.phone || null,
    mailing_address: row.mailing_address || null,
    website: row.website || null,
    xero_contact_id: row.xero_contact_id || null,
    notes: row.notes || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    is_active: row.is_active,
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
    pledge_status: row.pledge_status || null,
    pledge_condition: row.pledge_condition || null,
    pledge_status_changed_at: row.pledge_status_changed_at || null,
    pledge_status_note: row.pledge_status_note || null,
    is_multi_year_pledge: !!row.is_multi_year_pledge,
    discount_rate_bps: row.discount_rate_bps != null ? Number(row.discount_rate_bps) : null,
    pledge_years: row.pledge_years != null ? Number(row.pledge_years) : null,
    needs_discounting: !!row.is_multi_year_pledge && !row.discounting_accepted_at,
    discounting_accepted_at: row.discounting_accepted_at || null,
    discounted_present_value_cents: row.discounted_present_value_cents != null ? Number(row.discounted_present_value_cents) : null,
    receivable_account_id: row.receivable_account_id != null ? Number(row.receivable_account_id) : null,
    review_status: row.review_status || null,
    gift_source: row.gift_origin || row.source || null,
    not_gift_flagged_at: row.not_gift_flagged_at || null,
    not_gift_note: row.not_gift_note || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

const PLEDGE_STATUSES = new Set(['intention', 'conditional', 'unconditional']);

function parseGiftPostingFields(body, giftType, paymentMethod) {
  const out = {
    in_kind_description: null, in_kind_valuation_method: null, in_kind_fair_value_notes: null,
    in_kind_revenue_account_id: null, in_kind_expense_account_id: null,
    total_pledged_cents: null, is_multi_year_pledge: false, discount_rate_bps: null, pledge_years: null,
    discounted_present_value_cents: null, receivable_account_id: null,
    pledge_status: null, pledge_condition: null,
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
      const hasRate = body.discount_rate_bps != null && body.discount_rate_bps !== '' && !Number.isNaN(Number(body.discount_rate_bps));
      const hasYears = body.pledge_years != null && body.pledge_years !== '' && !Number.isNaN(Number(body.pledge_years));
      if (hasRate || hasYears) {
        const rateBps = Number.parseInt(String(body.discount_rate_bps), 10);
        if (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 5000) {
          return { error: 'discount_rate_bps must be 0-5000 when a rate is proposed' };
        }
        const years = Number(body.pledge_years);
        if (!Number.isFinite(years) || years <= 0) {
          return { error: 'pledge_years must be positive when a rate is proposed' };
        }
        out.discount_rate_bps = rateBps;
        out.pledge_years = years;
        out.discounted_present_value_cents = Math.round(out.total_pledged_cents / Math.pow(1 + rateBps / 10000, years));
      } else {
        out.discount_rate_bps = null;
        out.pledge_years = null;
        out.discounted_present_value_cents = null;
      }
    } else {
      out.discounted_present_value_cents = out.total_pledged_cents;
    }
    if (body.receivable_account_id != null && body.receivable_account_id !== '') {
      out.receivable_account_id = Number.parseInt(String(body.receivable_account_id), 10);
    }
    const ps = body.pledge_status == null || body.pledge_status === '' ? 'unconditional' : String(body.pledge_status);
    if (!PLEDGE_STATUSES.has(ps)) return { error: 'pledge_status must be intention, conditional or unconditional' };
    out.pledge_status = ps;
    out.pledge_condition = body.pledge_condition ? String(body.pledge_condition).trim() || null : null;
    if (ps === 'conditional' && !out.pledge_condition) return { error: 'Describe the condition that has to be met before this pledge counts.' };
    if (ps !== 'conditional') out.pledge_condition = null;
    out.posting_status = ps === 'unconditional' ? 'unposted' : 'held';
  }

  return { fields: out };
}

function registerOrganizationalDonorRoutes(app, pool) {
  const auth = requireAuth(pool);
  const orgAuth = [
    auth,
    requireOrganizationalAccess,
    requireOrgMembership(pool),
    requireOrgRole(['admin', ...FINANCE_ROLES, ...FUNDRAISING_ROLES]),
  ];
  const orgAuthBulkPii = [...orgAuth, requireOrgRole(['admin', ...FINANCE_ROLES])];
  const orgAuthRead = [auth, requireOrganizationalAccess, requireOrgMembership(pool), requireDonorRead(pool)];

  const orgBase = [auth, requireOrganizationalAccess, requireOrgMembership(pool)];
  const orgAuthContactRead = [...orgBase, requireContactRead(pool)];

  async function kindOfContact(req, id) {
    const n = Number(id);
    if (!Number.isInteger(n) || n < 1) return null;
    const r = await pool.query('SELECT kind FROM org_constituents WHERE id = $1 AND org_id = $2', [n, req.orgId]);
    return r.rows.length ? r.rows[0].kind : null;
  }
  const writeGate = requireContactWrite;
  const gateNewContact = writeGate(async (req) => { const k = parseKindFields(req.body || {}, null); return [k.kind]; });
  const gateContact = writeGate(async (req) => {
    const kinds = [await kindOfContact(req, req.params.id)];
    if (req.body && req.body.kind !== undefined) kinds.push(String(req.body.kind).trim().toLowerCase());
    return kinds;
  });
  const gateGiftOf = (param) => writeGate(async (req) => {
    const kinds = [];
    if (param) {
      const r = await pool.query(
        'SELECT c.kind FROM org_gifts g LEFT JOIN org_constituents c ON c.id = g.constituent_id WHERE g.id = $1 AND g.org_id = $2', [Number(req.params[param]), req.orgId]);
      kinds.push(r.rows.length ? r.rows[0].kind : null);
    }
    if (req.body && req.body.constituent_id != null && req.body.constituent_id !== '') kinds.push(await kindOfContact(req, req.body.constituent_id));
    return kinds;
  });
  const gateInteractionAdd = writeGate(async (req) => [await kindOfContact(req, req.params.id)]);
  const gateInteractionDelete = writeGate(async (req) => {
    const r = await pool.query(
      'SELECT c.kind FROM org_constituent_interactions i LEFT JOIN org_constituents c ON c.id = i.constituent_id WHERE i.id = $1 AND i.org_id = $2', [Number(req.params.id), req.orgId]);
    return [r.rows.length ? r.rows[0].kind : null];
  });
  async function contactInReadScope(req, constituentId) {
    if (req.contactScope !== 'organizations') return true;
    return (await kindOfContact(req, constituentId)) === 'organization';
  }

  // --- DISTINCT CONSTITUENT TAGS (for filter/autocomplete) ---
  app.get('/api/organizational/orgs/:slug/constituents/tags', ...orgAuthRead, async (req, res) => {
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
  app.get('/api/organizational/orgs/:slug/constituents/names', auth, requireOrganizationalAccess, requireOrgMembership(pool), async (req, res) => {
    const fullRoles = ['admin', ...FINANCE_ROLES];
    if (!fullRoles.includes(req.coopOrgRole) && !(req.accessPermissions || []).includes('accounting_read')) {
      return res.status(403).json({ code: 'no_access', error: 'You do not have access to this list. Ask an admin to give you access.' });
    }
    try {
      const role = String(req.query.role || '').trim().toLowerCase();
      const roleFilter = ['vendor', 'customer', 'donor'].includes(role) ? `AND ${hasRoleCondition(role)}` : '';
      const r = await pool.query(
        `SELECT c.id, c.display_name, c.kind, ${ROLES_SELECT}
           FROM org_constituents c
          WHERE c.org_id = $1 AND c.is_active = $2 ${roleFilter}
          ORDER BY c.display_name`,
        [req.orgId, String(req.query.active || 'true').toLowerCase() !== 'false']);
      return res.json(r.rows);
    } catch (e) {
      console.error('GET /constituents/names:', e.message);
      return res.status(500).json({ error: 'Could not load contact names' });
    }
  });

  app.get('/api/organizational/orgs/:slug/constituents', ...orgAuthContactRead, async (req, res) => {
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

      if (req.contactScope === 'organizations') conditions.push(`c.kind = 'organization'`);

      if (isInstitutions) {
        conditions.push(`c.kind = 'organization'`, hasRoleCondition('donor'));
      }
      if (req.query.kind) {
        const k = String(req.query.kind).trim().toLowerCase();
        if (k !== 'individual' && k !== 'organization') return res.status(400).json({ error: 'Invalid kind' });
        conditions.push(`c.kind = $${params.length + 1}`);
        params.push(k);
      }
      if (req.query.org_type) {
        conditions.push(`c.org_type = $${params.length + 1}`);
        params.push(String(req.query.org_type).trim().toLowerCase());
      }

      const role = String(req.query.role || '').trim().toLowerCase();
      if (role) {
        if (!CONTACT_ROLES.has(role)) return res.status(400).json({ error: 'Invalid role' });
        conditions.push(hasRoleCondition(role));
      }

      if (req.query.q) {
        const q = `%${String(req.query.q).trim()}%`;
        conditions.push(`(c.display_name ILIKE $${params.length + 1} OR c.email ILIKE $${params.length + 1} OR array_to_string(c.additional_emails, ' ') ILIKE $${params.length + 1})`);
        params.push(q);
      }

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
          `SELECT c.*, ${ROLES_SELECT},
                  COALESCE(SUM(gift.amount_cents), 0) AS lifetime_giving_cents,
                  COUNT(gr.id) FILTER (WHERE gr.status NOT IN ('declined','closed'))
                    AS active_grant_count,
                  MIN(LEAST(gr.next_report_due, gr.renewal_application_due))
                    FILTER (WHERE LEAST(gr.next_report_due, gr.renewal_application_due) >= CURRENT_DATE)
                    AS next_deadline,
                  COALESCE(SUM(gr.amount_cents) FILTER (WHERE gr.status NOT IN ('declined')), 0)
                    AS total_awarded_cents
           FROM org_constituents c
           LEFT JOIN org_gifts gift ON gift.constituent_id = c.id AND gift.posting_status <> 'void' AND gift.review_status <> 'dismissed'
           LEFT JOIN org_grants gr ON gr.constituent_id = c.id AND gr.org_id = c.org_id
           WHERE ${whereClause}
           GROUP BY c.id
           ORDER BY c.display_name ASC`,
          params
        );
      } else {
        r = await pool.query(
          `SELECT c.*, ${ROLES_SELECT},
                  COALESCE(SUM(g.amount_cents), 0) AS lifetime_giving_cents,
                  MAX(g.received_at) AS last_gift_date
           FROM org_constituents c
           LEFT JOIN org_gifts g ON g.constituent_id = c.id AND g.posting_status <> 'void' AND g.review_status <> 'dismissed'
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
  app.get('/api/organizational/orgs/:slug/constituents/:id', ...orgAuthContactRead, async (req, res, next) => {
    if (req.params.id === 'export.csv') return next('route');
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      const orgId = req.orgId;
      const r = await pool.query(
        `SELECT c.*, ${ROLES_SELECT},
                COALESCE(SUM(g.amount_cents), 0) AS lifetime_giving_cents
         FROM org_constituents c
         LEFT JOIN org_gifts g ON g.constituent_id = c.id AND g.posting_status <> 'void' AND g.review_status <> 'dismissed'
         WHERE c.id = $1 AND c.org_id = $2
         GROUP BY c.id
         LIMIT 1`,
        [constituentId, orgId]
      );
      if (!r.rows.length || (req.contactScope === 'organizations' && r.rows[0].kind !== 'organization')) return res.status(404).json({ error: 'Constituent not found' });
      return res.json(rowToConstituent(r.rows[0]));
    } catch (e) {
      console.error('GET constituent:', e.message);
      return res.status(500).json({ error: 'Could not load constituent' });
    }
  });

  // --- CONSTITUENT CREATE ---
  app.post('/api/organizational/orgs/:slug/constituents', ...orgBase, gateNewContact, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const displayName = String(body.display_name || '').trim();
      if (!displayName) return res.status(400).json({ error: 'display_name is required' });

      const kindFields = parseKindFields(body, null);
      if (kindFields.error) return res.status(400).json({ error: kindFields.error });
      const rolesParsed = body.roles !== undefined ? parseRoles(body.roles) : { roles: [] };
      if (rolesParsed.error) return res.status(400).json({ error: rolesParsed.error });

      const xeroContactId = body.xero_contact_id ? String(body.xero_contact_id).trim() || null : null;

      const tags = Array.isArray(body.tags)
        ? body.tags.map(t => String(t).trim()).filter(Boolean)
        : null;

      const client = await pool.connect();
      let r;
      try {
        await client.query('BEGIN');
        r = await client.query(
          `INSERT INTO org_constituents
             (org_id, kind, org_type, display_name, first_name, last_name, email, phone,
              mailing_address, website, xero_contact_id, notes, tags, is_active, additional_emails)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,$14)
           RETURNING *`,
          [
            orgId, kindFields.kind, kindFields.org_type, displayName,
            body.first_name ? String(body.first_name).trim() || null : null,
            body.last_name ? String(body.last_name).trim() || null : null,
            body.email ? String(body.email).trim() || null : null,
            body.phone ? String(body.phone).trim() || null : null,
            body.mailing_address ? String(body.mailing_address).trim() || null : null,
            body.website ? String(body.website).trim() || null : null,
            xeroContactId,
            body.notes ? String(body.notes).trim() || null : null,
            tags && tags.length ? tags : null,
            parseEmails(body.additional_emails) || null,
          ]
        );
        await setContactRoles(client, orgId, r.rows[0].id, rolesParsed.roles);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      const row = { ...r.rows[0], roles: rolesParsed.roles, lifetime_giving_cents: 0 };
      logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_constituents', recordId: r.rows[0].id, metadata: { ...reqMeta(req), name: r.rows[0].display_name, roles: rolesParsed.roles } }).catch(() => {});
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
  app.patch('/api/organizational/orgs/:slug/constituents/:id', ...orgBase, gateContact, async (req, res) => {
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

      const kindFields = parseKindFields(body, row);
      if (kindFields.error) return res.status(400).json({ error: kindFields.error });
      const rolesParsed = body.roles !== undefined ? parseRoles(body.roles) : null;
      if (rolesParsed && rolesParsed.error) return res.status(400).json({ error: rolesParsed.error });

      const displayName = body.display_name !== undefined ? String(body.display_name).trim() : row.display_name;
      if (!displayName) return res.status(400).json({ error: 'display_name cannot be empty' });

      const xeroContactId = body.xero_contact_id !== undefined
        ? (body.xero_contact_id ? String(body.xero_contact_id).trim() || null : null)
        : row.xero_contact_id;

      const newTags = body.tags !== undefined
        ? (Array.isArray(body.tags) ? body.tags.map(t => String(t).trim()).filter(Boolean) : null)
        : (Array.isArray(row.tags) ? row.tags : null);

      const oldRolesR = await pool.query(`SELECT ${ROLES_SELECT} FROM org_constituents c WHERE c.id = $1 AND c.org_id = $2`, [constituentId, orgId]);
      const client = await pool.connect();
      let r;
      try {
        await client.query('BEGIN');
        r = await client.query(
          `UPDATE org_constituents SET
             kind = $1, org_type = $2, display_name = $3, first_name = $4, last_name = $5,
             email = $6, phone = $7, mailing_address = $8, website = $9,
             xero_contact_id = $10, notes = $11, is_active = $12, tags = $13, additional_emails = $14
           WHERE id = $15 AND org_id = $16
           RETURNING *`,
          [
            kindFields.kind, kindFields.org_type, displayName,
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
            body.additional_emails !== undefined ? parseEmails(body.additional_emails) : (row.additional_emails || null),
            constituentId, orgId,
          ]
        );
        if (rolesParsed) await setContactRoles(client, orgId, constituentId, rolesParsed.roles);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      const rolesR = await pool.query(
        `SELECT ${ROLES_SELECT} FROM org_constituents c WHERE c.id = $1 AND c.org_id = $2`,
        [constituentId, orgId]
      );
      const lifetimeR = await pool.query(
        "SELECT COALESCE(SUM(amount_cents),0) AS lifetime_giving_cents FROM org_gifts WHERE constituent_id = $1 AND posting_status <> 'void' AND review_status <> 'dismissed'",
        [constituentId]
      );
      const updated = { ...r.rows[0], roles: rolesR.rows[0].roles, lifetime_giving_cents: Number(lifetimeR.rows[0].lifetime_giving_cents) };
      const auditFields = diffFields(row, r.rows[0], ['display_name', 'kind', 'org_type', 'first_name', 'last_name', 'email', 'phone', 'mailing_address', 'website', 'is_active']);
      const oldRoles = (oldRolesR.rows[0] && oldRolesR.rows[0].roles || []).join(', ');
      const newRoles = (rolesR.rows[0].roles || []).join(', ');
      if (oldRoles !== newRoles) auditFields.push({ fieldName: 'roles', oldValue: oldRoles || '(none)', newValue: newRoles || '(none)' });
      if (auditFields.length) logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_constituents', recordId: constituentId, fields: auditFields, metadata: reqMeta(req) }).catch(() => {});
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
  app.delete('/api/organizational/orgs/:slug/constituents/:id', ...orgBase, gateContact, async (req, res) => {
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
          return res.status(409).json({ error: 'This contact has gift or interaction history. Use Archive instead.' });
        }
        const gone = await pool.query('SELECT display_name FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, orgId]);
        await pool.query('DELETE FROM org_constituents WHERE id = $1 AND org_id = $2', [constituentId, orgId]);
        logAudit(pool, { orgId, userId, action: 'delete', tableName: 'org_constituents', recordId: constituentId, metadata: { ...reqMeta(req), name: gone.rows[0] && gone.rows[0].display_name } }).catch(() => {});
        return res.json({ ok: true, deleted: true });
      }
      const r = await pool.query(
        'UPDATE org_constituents SET is_active = false WHERE id = $1 AND org_id = $2 RETURNING id',
        [constituentId, orgId]
      );
      if (!r.rows.length) return res.status(404).json({ error: 'Constituent not found' });
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_constituents', recordId: constituentId, fields: [{ fieldName: 'is_active', oldValue: 'true', newValue: 'false' }], metadata: reqMeta(req) }).catch(() => {});
      return res.json({ ok: true });
    } catch (e) {
      if (e.code === '23503') return res.status(409).json({ error: 'This contact is used by bills, invoices, entries or other records. Use Archive instead.' });
      console.error('DELETE constituent:', e.message);
      return res.status(500).json({ error: 'Could not remove constituent' });
    }
  });

  // --- GIVING HISTORY (constituent: gifts + membership dues unified) ---
  app.get('/api/organizational/orgs/:slug/constituents/:id/gifts', ...orgAuthContactRead, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      if (!(await contactInReadScope(req, constituentId))) return res.status(404).json({ error: 'Constituent not found' });
      const orgId = req.orgId;

      const constituentCheck = await pool.query(
        'SELECT email FROM org_constituents WHERE id = $1 AND org_id = $2 LIMIT 1',
        [constituentId, orgId]
      );
      if (!constituentCheck.rows.length) return res.status(404).json({ error: 'Constituent not found' });

      const r = await pool.query(
        `SELECT *, source AS gift_origin
         FROM org_gifts
         WHERE constituent_id = $1 AND org_id = $2
         ORDER BY received_at DESC`,
        [constituentId, orgId]
      );

      const duesR = await pool.query(
        `SELECT mp.id, mp.amount_cents, mp.currency, mp.payment_date AS received_at,
                mp.method AS payment_method, mp.notes, mp.created_at
         FROM org_membership_payments mp
         WHERE mp.org_id = $1 AND mp.constituent_id = $2 AND mp.kind = 'payment' AND mp.posting_status <> 'void'
         ORDER BY mp.payment_date DESC`,
        [orgId, constituentId]
      );
      const dues = duesR.rows.map(d => ({
        ...d,
        gift_type: 'membership_dues',
        source: 'membership_dues',
        amount_dollars: Number(d.amount_cents) / 100,
      }));

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
  app.post('/api/organizational/orgs/:slug/gifts', ...orgBase, gateGiftOf(null), async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const body = req.body || {};
    try {
      const orgId = req.orgId;

      const giftType = String(body.gift_type || 'donation').trim();
      if (!GIFT_TYPES.has(giftType)) return res.status(400).json({ error: 'Invalid gift_type' });

      const amountResult = giftType === 'pledge' ? { value: 0 } : parseAmountCents(body);
      if (amountResult.error) return res.status(400).json({ error: amountResult.error });

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
            discounted_present_value_cents, receivable_account_id, pledge_years,
            pledge_status, pledge_condition, pledge_status_changed_by, pledge_status_changed_at, pledge_status_note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31)
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
          pf.discounted_present_value_cents, pf.receivable_account_id, pf.pledge_years != null ? pf.pledge_years : null,
          pf.pledge_status, pf.pledge_condition, pf.pledge_status ? userId : null, pf.pledge_status ? new Date().toISOString() : null,
          pf.pledge_status ? 'Recorded as ' + pf.pledge_status : null,
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
  app.patch('/api/organizational/orgs/:slug/gifts/:id', ...orgBase, gateGiftOf('id'), async (req, res) => {
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

      const touchesPostingFields = ['gift_type', 'payment_method', 'amount_cents', 'amount',
        'in_kind_description', 'in_kind_valuation_method', 'in_kind_fair_value_notes',
        'in_kind_revenue_account_id', 'in_kind_expense_account_id', 'program_id',
        'total_pledged_cents', 'total_pledged', 'is_multi_year_pledge', 'discount_rate_bps',
        'pledge_years', 'receivable_account_id', 'pledge_status', 'pledge_condition'].some((k) => body[k] !== undefined);
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
        pledge_years: body.pledge_years !== undefined ? body.pledge_years : row.pledge_years,
        receivable_account_id: body.receivable_account_id !== undefined ? body.receivable_account_id : row.receivable_account_id,
        pledge_status: body.pledge_status !== undefined ? body.pledge_status : row.pledge_status,
        pledge_condition: body.pledge_condition !== undefined ? body.pledge_condition : row.pledge_condition,
      }, giftType, paymentMethod);
      if (posting.error) return res.status(400).json({ error: posting.error });
      const pf = posting.fields;
      const finalAmountCents = giftType === 'pledge' ? pf.discounted_present_value_cents : amountCents;
      const nextPostingStatus = ['posted', 'void'].includes(row.posting_status) ? row.posting_status : pf.posting_status;
      let statusChangedBy = row.pledge_status_changed_by != null ? row.pledge_status_changed_by : null;
      let statusChangedAt = row.pledge_status_changed_at || null;
      let statusNote = row.pledge_status_note || null;
      if (giftType === 'pledge' && row.gift_type === 'pledge' && pf.pledge_status !== row.pledge_status) {
        const note = body.pledge_status_note ? String(body.pledge_status_note).trim() : '';
        if (note.length < 3) return res.status(400).json({ error: 'Say why the status is changing (for example, the donor confirmed in writing, or the condition was met).' });
        statusChangedBy = userId; statusChangedAt = new Date().toISOString(); statusNote = note;
      }

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
           discounted_present_value_cents = $22, receivable_account_id = $23, pledge_years = $24,
           pledge_status = $27, pledge_condition = $28, pledge_status_changed_by = $29, pledge_status_changed_at = $30, pledge_status_note = $31
         WHERE id = $25 AND org_id = $26
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
          nextPostingStatus, pf.program_id,
          pf.in_kind_description, pf.in_kind_valuation_method, pf.in_kind_fair_value_notes,
          pf.in_kind_revenue_account_id, pf.in_kind_expense_account_id,
          pf.total_pledged_cents, pf.is_multi_year_pledge, pf.discount_rate_bps,
          pf.discounted_present_value_cents, pf.receivable_account_id, pf.pledge_years != null ? pf.pledge_years : null,
          giftId, orgId,
          pf.pledge_status, pf.pledge_condition, statusChangedBy, statusChangedAt, statusNote,
        ]
      );
      return res.json(rowToGift(r.rows[0]));
    } catch (e) {
      if (e.statusCode) return res.status(e.statusCode).json({ error: e.message });
      console.error('PATCH gift:', e.message);
      return res.status(500).json({ error: 'Could not update gift' });
    }
  });

  // --- GIFTS RECORDED IN ACCOUNTING, TO CONFIRM ---
  app.get('/api/organizational/orgs/:slug/gifts/to-confirm', ...orgAuthRead, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT g.id, g.gift_type, g.amount_cents, g.received_at, g.constituent_id, c.display_name AS constituent_name,
                g.grant_id, gr.name AS grant_name, g.ledger_transaction_id, t.memo, t.payee, u.email AS recorded_by_email,
                t.constituent_id AS payer_id, pc.display_name AS payer_name,
                (SELECT string_agg(DISTINCT a.code || ' ' || a.name, ', ') FROM org_ledger_lines ll
                   JOIN org_accounts a ON a.id = ll.account_id
                  WHERE ll.transaction_id = g.ledger_transaction_id AND a.standard_category = 'REV_CONTRIB' AND ll.credit_cents > 0) AS revenue_accounts
           FROM org_gifts g
           LEFT JOIN org_constituents c ON c.id = g.constituent_id
           LEFT JOIN org_grants gr ON gr.id = g.grant_id
           LEFT JOIN org_ledger_transactions t ON t.id = g.ledger_transaction_id
           LEFT JOIN org_constituents pc ON pc.id = t.constituent_id
           LEFT JOIN users u ON u.id = g.recorded_by_user_id
          WHERE g.org_id = $1 AND g.review_status = 'to_confirm' AND g.posting_status <> 'void'
          ORDER BY g.received_at DESC, g.id DESC`, [req.orgId]);
      return res.json({ gifts: r.rows.map((x) => ({
        id: x.id, gift_type: x.gift_type, amount_cents: Number(x.amount_cents), received_at: x.received_at,
        constituent_id: x.constituent_id != null ? Number(x.constituent_id) : null, constituent_name: x.constituent_name || null,
        grant_name: x.grant_name || null, ledger_transaction_id: x.ledger_transaction_id != null ? Number(x.ledger_transaction_id) : null,
        payer_id: x.payer_id != null ? Number(x.payer_id) : null, payer_name: x.payer_name || null,
        memo: x.memo || null, payee: x.payee || null, recorded_by: x.recorded_by_email || null, revenue_accounts: x.revenue_accounts || null,
      })) });
    } catch (e) {
      console.error('GET gifts/to-confirm:', e.message);
      return res.status(500).json({ error: 'Could not load the gifts to confirm' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gifts/:id/confirm', ...orgBase, gateGiftOf('id'), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    const body = req.body || {};
    try {
      const g = (await pool.query(`SELECT * FROM org_gifts WHERE id = $1 AND org_id = $2 AND source = 'accounting' LIMIT 1`, [giftId, orgId])).rows[0];
      if (!g) return res.status(404).json({ error: 'Gift not found' });
      if (g.review_status !== 'to_confirm') return res.status(409).json({ error: 'This gift is already ' + g.review_status + '.' });
      let donorId = g.constituent_id != null ? Number(g.constituent_id) : null;
      if (body.constituent_id != null && body.constituent_id !== '') {
        donorId = Number.parseInt(String(body.constituent_id), 10);
        if (!Number.isInteger(donorId) || donorId < 1) return res.status(400).json({ error: 'constituent_id must be a positive integer' });
        const c = await pool.query('SELECT 1 FROM org_constituents WHERE id = $1 AND org_id = $2', [donorId, orgId]);
        if (!c.rows.length) return res.status(400).json({ error: 'That contact was not found in this workspace' });
      }
      if (!donorId) return res.status(400).json({ error: 'Choose the donor from Contacts before confirming.' });
      const campaign = body.campaign !== undefined ? (String(body.campaign || '').trim() || null) : g.campaign;
      await addContactRoles(pool, orgId, donorId, ['donor']);
      await pool.query(
        `UPDATE org_gifts SET constituent_id = $1, campaign = $2, review_status = 'confirmed', reviewed_by = $3, reviewed_at = NOW() WHERE id = $4 AND org_id = $5`,
        [donorId, campaign, userId, giftId, orgId]);
      let ledgerContactSet = false;
      if (g.ledger_transaction_id) {
        try {
          const u = await pool.query(
            `UPDATE org_ledger_transactions SET constituent_id = $1 WHERE id = $2 AND org_id = $3 AND constituent_id IS NULL`,
            [donorId, g.ledger_transaction_id, orgId]);
          ledgerContactSet = u.rowCount > 0;
          if (ledgerContactSet) {
            logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: g.ledger_transaction_id,
              fields: [{ fieldName: 'Contact', oldValue: null, newValue: 'contact #' + donorId }], metadata: { ...reqMeta(req), reason: 'Donor confirmed in Funding for gift #' + giftId } }).catch(() => {});
          }
        } catch (e) { console.error('confirm gift: could not set the entry contact:', e.message); }
      }
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Review', oldValue: 'to_confirm', newValue: 'confirmed' }], metadata: reqMeta(req) }).catch(() => {});
      return res.json({ id: giftId, review_status: 'confirmed', constituent_id: donorId, ledger_contact_set: ledgerContactSet });
    } catch (e) {
      console.error('POST gifts/:id/confirm:', e.message);
      return res.status(500).json({ error: 'Could not confirm this gift' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gifts/:id/not-a-gift', ...orgBase, gateGiftOf('id'), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    const note = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (note.length < 3) return res.status(400).json({ error: 'Say why this is not a gift (a refund, a transfer, a reimbursement).' });
    try {
      const u = await pool.query(
        `UPDATE org_gifts SET not_gift_flagged_at = NOW(), not_gift_flagged_by = $1, not_gift_note = $2,
                review_status = CASE WHEN review_status = 'to_confirm' THEN 'dismissed' ELSE review_status END,
                reviewed_by = CASE WHEN review_status = 'to_confirm' THEN $1 ELSE reviewed_by END,
                reviewed_at = CASE WHEN review_status = 'to_confirm' THEN NOW() ELSE reviewed_at END
          WHERE id = $3 AND org_id = $4 AND posting_status <> 'void' AND review_status <> 'dismissed' AND not_gift_flagged_at IS NULL
          RETURNING id, ledger_transaction_id`, [userId, note, giftId, orgId]);
      if (!u.rows.length) return res.status(404).json({ error: 'This gift is already flagged, dismissed or voided' });
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Not a gift', oldValue: null, newValue: 'flagged for Accounting' }], metadata: { ...reqMeta(req), reason: note } }).catch(() => {});
      if (u.rows[0].ledger_transaction_id) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: u.rows[0].ledger_transaction_id,
          fields: [{ fieldName: 'Donor review', oldValue: null, newValue: 'Marked not a gift' }], metadata: { ...reqMeta(req), reason: note } }).catch(() => {});
      }
      return res.json({ id: giftId, flagged: true });
    } catch (e) {
      console.error('POST gifts/:id/not-a-gift:', e.message);
      return res.status(500).json({ error: 'Could not flag this gift' });
    }
  });

  app.post('/api/organizational/orgs/:slug/gifts/:id/dismiss', ...orgBase, gateGiftOf('id'), async (req, res) => {
    const orgId = req.orgId;
    const userId = req.user.user_id ?? req.user.id;
    const giftId = Number.parseInt(String(req.params.id), 10);
    if (!Number.isInteger(giftId) || giftId < 1) return res.status(400).json({ error: 'Invalid id' });
    const note = req.body && req.body.reason != null ? String(req.body.reason).trim() : '';
    if (note.length < 3) return res.status(400).json({ error: 'Say why this is not a gift (a refund, a transfer, a reimbursement).' });
    try {
      const u = await pool.query(
        `UPDATE org_gifts SET review_status = 'dismissed', reviewed_by = $1, reviewed_at = NOW(), review_note = $2
          WHERE id = $3 AND org_id = $4 AND source = 'accounting' AND review_status IN ('to_confirm', 'confirmed') RETURNING id, ledger_transaction_id`, [userId, note, giftId, orgId]);
      if (!u.rows.length) return res.status(404).json({ error: 'No gift from Accounting with that id' });
      if (u.rows[0].ledger_transaction_id) {
        logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_ledger_transactions', recordId: u.rows[0].ledger_transaction_id,
          fields: [{ fieldName: 'Donor review', oldValue: null, newValue: 'Marked not a gift' }], metadata: { ...reqMeta(req), reason: note } }).catch(() => {});
      }
      logAudit(pool, { orgId, userId, action: 'update', tableName: 'org_gifts', recordId: giftId,
        fields: [{ fieldName: 'Review', oldValue: 'confirmed or to confirm', newValue: 'dismissed' }], metadata: { ...reqMeta(req), reason: note } }).catch(() => {});
      return res.json({ id: giftId, review_status: 'dismissed' });
    } catch (e) {
      console.error('POST gifts/:id/dismiss:', e.message);
      return res.status(500).json({ error: 'Could not update this gift' });
    }
  });

  // --- PROMISED, NOT YET IN THE BOOKS ---
  app.get('/api/organizational/orgs/:slug/gifts/promised-summary', ...orgAuthRead, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT pledge_status, posting_status, COUNT(*)::int AS n, COALESCE(SUM(total_pledged_cents), 0)::bigint AS face_cents
           FROM org_gifts WHERE org_id = $1 AND gift_type = 'pledge' AND posting_status <> 'void'
          GROUP BY 1, 2`, [req.orgId]);
      const out = { intention: { n: 0, cents: 0 }, conditional: { n: 0, cents: 0 }, awaiting_accounting: { n: 0, cents: 0 }, booked: { n: 0, cents: 0 } };
      r.rows.forEach((x) => {
        const k = x.posting_status === 'held' ? (x.pledge_status === 'conditional' ? 'conditional' : 'intention')
          : x.posting_status === 'unposted' ? 'awaiting_accounting' : x.posting_status === 'posted' ? 'booked' : null;
        if (k) { out[k].n += x.n; out[k].cents += Number(x.face_cents); }
      });
      return res.json(out);
    } catch (e) {
      console.error('GET gifts/promised-summary:', e.message);
      return res.status(500).json({ error: 'Could not load the promised total' });
    }
  });

  // --- GIFT DELETE ---
  app.delete('/api/organizational/orgs/:slug/gifts/:id', ...orgBase, gateGiftOf('id'), async (req, res) => {
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
  app.get('/api/organizational/orgs/:slug/gifts/:giftId/installments', ...orgAuthRead, async (req, res) => {
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

  app.post('/api/organizational/orgs/:slug/gifts/:giftId/installments', ...orgBase, gateGiftOf('giftId'), async (req, res) => {
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

  app.patch('/api/organizational/orgs/:slug/gifts/:giftId/installments/:id', ...orgBase, gateGiftOf('giftId'), async (req, res) => {
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
  app.post('/api/organizational/orgs/:slug/gifts/:id/acknowledge', ...orgBase, gateGiftOf('id'), async (req, res) => {
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
  app.get('/api/organizational/orgs/:slug/gifts/campaigns', ...orgAuthRead, async (req, res) => {
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

  app.get('/api/organizational/orgs/:slug/giving-summary', ...orgAuthRead, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

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

      if (req.query.campaign) {
        dateClause += ` AND campaign = $${params.length + 1}`;
        params.push(String(req.query.campaign).trim());
      }

      const totalsR = await pool.query(
        `SELECT
           COUNT(*) AS total_gifts,
           COUNT(DISTINCT constituent_id) AS total_donors,
           COALESCE(SUM(CASE WHEN gift_type = 'pledge' THEN COALESCE(total_pledged_cents, amount_cents) ELSE amount_cents END), 0) AS total_gifts_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'grant' THEN amount_cents END), 0) AS grant_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'donation' THEN amount_cents END), 0) AS donation_cents,
           COALESCE(SUM(CASE WHEN gift_type = 'pledge' THEN COALESCE(total_pledged_cents, amount_cents) END), 0) AS pledge_cents,
           COUNT(*) FILTER (WHERE gift_type = 'pledge') AS pledge_count,
           COALESCE(SUM(CASE WHEN gift_type = 'membership_dues' THEN amount_cents END), 0) AS membership_dues_cents
         FROM org_gifts
         WHERE org_id = $1 AND posting_status <> 'void' AND review_status <> 'dismissed'${dateClause}`,
        params
      );

      const topR = await pool.query(
        `SELECT c.id, c.display_name, COALESCE(SUM(CASE WHEN g.gift_type = 'pledge' THEN 0 ELSE g.amount_cents END), 0) AS total_cents
         FROM org_constituents c
         INNER JOIN org_gifts g ON g.constituent_id = c.id AND g.posting_status <> 'void' AND g.review_status <> 'dismissed'
         WHERE g.org_id = $1${dateClause}
         GROUP BY c.id, c.display_name
         HAVING COALESCE(SUM(CASE WHEN g.gift_type = 'pledge' THEN 0 ELSE g.amount_cents END), 0) > 0
         ORDER BY total_cents DESC
         LIMIT 10`,
        params
      );

      const t = totalsR.rows[0];
      const receivedCents = Number(t.total_gifts_cents) - Number(t.pledge_cents);
      const receivedCount = Number(t.total_gifts) - Number(t.pledge_count);
      return res.json({
        total_gifts_cents: Number(t.total_gifts_cents),
        received_cents: receivedCents,
        pledged_cents: Number(t.pledge_cents),
        total_gifts: receivedCount,
        total_donors: Number(t.total_donors),
        avg_gift_cents: receivedCount > 0 ? Math.round(receivedCents / receivedCount) : 0,
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
  app.get('/api/organizational/orgs/:slug/grants/unlinked', ...orgAuthRead, async (req, res) => {
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
  app.get('/api/organizational/orgs/:slug/constituents/:id/grants', ...orgAuthContactRead, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      if (!(await contactInReadScope(req, constituentId))) return res.status(404).json({ error: 'Constituent not found' });
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
  app.get('/api/organizational/orgs/:slug/donors/dashboard', ...orgAuthRead, boardSeesAllPrograms, async (req, res) => {
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
  app.get('/api/organizational/orgs/:slug/constituents/:id/interactions', ...orgAuthContactRead, async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    const constituentId = Number(req.params.id);
    if (!Number.isInteger(constituentId) || constituentId < 1) return res.status(400).json({ error: 'Invalid id' });
    try {
      if (!(await contactInReadScope(req, constituentId))) return res.status(404).json({ error: 'Constituent not found' });
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
  app.post('/api/organizational/orgs/:slug/constituents/:id/interactions', ...orgBase, gateInteractionAdd, async (req, res) => {
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
  app.delete('/api/organizational/orgs/:slug/interactions/:id', ...orgBase, gateInteractionDelete, async (req, res) => {
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
  const exportConstituents = async (req, res) => {
    const slug = String(req.params.slug || '').trim();
    const userId = req.user.user_id ?? req.user.id;
    try {
      const orgId = req.orgId;

      const conditions = ['c.org_id = $1'];
      const params = [orgId];

      const ids = req.method === 'POST' && Array.isArray(req.body && req.body.ids)
        ? [...new Set(req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))] : null;
      if (ids) {
        conditions.push(`c.id = ANY($${params.length + 1}::int[])`);
        params.push(ids);
      } else {
        const activeParam = String(req.query.active || 'true').toLowerCase();
        if (activeParam !== 'all') {
          conditions.push(`c.is_active = $${params.length + 1}`);
          params.push(activeParam !== 'false');
        }
        if (req.query.role && CONTACT_ROLES.has(String(req.query.role).trim())) {
          conditions.push(hasRoleCondition(String(req.query.role).trim()));
        }
        if (req.query.tags) {
          const tagList = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
          if (tagList.length) { conditions.push(`c.tags && $${params.length + 1}`); params.push(tagList); }
        }
      }

      const r = await pool.query(
        `SELECT c.first_name, c.last_name, c.display_name, c.email, c.mailing_address, c.kind, c.org_type, ${ROLES_SELECT}, c.tags
         FROM org_constituents c WHERE ${conditions.join(' AND ')} ORDER BY c.display_name ASC`,
        params
      );

      function csvRow(cells) { return cells.map(csvEscape).join(',') + '\r\n'; }
      let csv = csvRow(['first_name','last_name','display_name','email','mailing_address','kind','org_type','roles','tags']);
      for (const row of r.rows) {
        csv += csvRow([
          row.first_name || '',
          row.last_name || '',
          row.display_name || '',
          row.email || '',
          row.mailing_address || '',
          row.kind || '',
          row.org_type || '',
          Array.isArray(row.roles) ? row.roles.join(';') : '',
          Array.isArray(row.tags) ? row.tags.join(';') : '',
        ]);
      }

      const date = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="funders-export-${date}.csv"`);
      return res.send(csv);
    } catch (e) {
      console.error('constituents/export.csv:', e.message);
      return res.status(500).json({ error: 'Export failed' });
    }
  };
  app.get('/api/organizational/orgs/:slug/constituents/export.csv', ...orgAuthBulkPii, exportConstituents);
  app.post('/api/organizational/orgs/:slug/constituents/export.csv', ...orgAuthBulkPii, exportConstituents);

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
                   display_name = $1, kind = $2, org_type = $3, email = $4, phone = $5,
                   mailing_address = $6, website = $7, notes = $8,
                   tags = COALESCE($9, tags)
                 WHERE id = $10 AND org_id = $11`,
                [
                  rec.display_name, rec.kind, rec.org_type, rec.email, rec.phone,
                  rec.mailing_address, rec.website, rec.notes,
                  rec.tags && rec.tags.length ? rec.tags : null,
                  existingId, orgId,
                ]
              );
              await addContactRoles(client, orgId, existingId, rec.roles);
              updated += 1;
            } else {
              const nr = await client.query(
                `INSERT INTO org_constituents
                   (org_id, kind, org_type, display_name, email, phone, mailing_address, website, notes, tags, is_active)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true) RETURNING id`,
                [
                  orgId, rec.kind, rec.org_type, rec.display_name, rec.email, rec.phone,
                  rec.mailing_address, rec.website, rec.notes,
                  rec.tags && rec.tags.length ? rec.tags : null,
                ]
              );
              const newId = nr.rows[0].id;
              await addContactRoles(client, orgId, newId, rec.roles);
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
