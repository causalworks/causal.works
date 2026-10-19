'use strict';

// Membership staff routes: settings, tiers and prices, dues members (a filtered contact view), terms,
// payments, waivers, refunds, extensions, ending a term, renewals and the summary.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireWriteAccess, requireReadAccess } = require('../middleware/requireWriteAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('../lib/fiscalYear');
const S = require('../lib/membershipStatus');
const M = require('../lib/membership');
const J = require('../lib/membershipJoin');
const Pay = require('../lib/membershipPayments');
const { addContactRoles } = require('../lib/contactRoles');
const Msg = require('../lib/membershipMessages');

const { cents, day, text } = M;

const METHODS = ['card', 'check', 'transfer', 'cash', 'other'];
const TIER_FIELDS = ['name', 'description', 'applies_to', 'pay_what_you_can', 'min_price_cents', 'suggested_price_cents',
  'budget_low_cents', 'budget_high_cents', 'benefit_value_cents', 'seats_included', 'benefits', 'eligibility_statement',
  'eligibility_required', 'display_order', 'revenue_account_id', 'program_id'];

// --- Input parsing ---

function userIdOf(req) { return req.user && (req.user.user_id ?? req.user.id); }

function intId(v) {
  const n = Number.parseInt(String(v), 10);
  return Number.isInteger(n) && n > 0 && String(n) === String(v).trim() ? n : null;
}

function csvCell(v) {
  let s = String(v == null ? '' : v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function fail(res, code, error, extra) {
  return res.status(code).json({ error, ...(extra || {}) });
}

function registerMembershipRoutes(app, pool) {
  const base = [requireAuth(pool), requireOrganizationalAccess, requireOrgMembership(pool)];
  const read = [...base, requireReadAccess('membership')];
  const summaryRead = [...base, requireReadAccess('membership_summary')];
  const write = [...base, requireWriteAccess('membership')];
  const adminFinance = [...base, requireOrgRole(['admin', ...FINANCE_ROLES])];
  const B = '/api/organizational/orgs/:slug/membership';

  async function inTransaction(fn) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(client);
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
  }

  function audit(req, action, tableName, recordId, extra) {
    return logAudit(pool, {
      orgId: req.orgId, userId: userIdOf(req), action, tableName, recordId,
      fields: extra && extra.fields, metadata: { ...reqMeta(req), ...((extra && extra.metadata) || {}) },
    });
  }

  async function loadTerm(req, id) {
    const r = await pool.query(
      `SELECT t.*, c.kind AS contact_kind FROM org_membership_terms t JOIN org_constituents c ON c.id = t.constituent_id
        WHERE t.id = $1 AND t.org_id = $2`, [id, req.orgId]);
    return r.rows[0] || null;
  }

  async function loadTier(orgId, id) {
    const r = await pool.query('SELECT * FROM org_membership_tiers WHERE id = $1 AND org_id = $2', [id, orgId]);
    return r.rows[0] || null;
  }

  // --- Settings ---

  app.get(`${B}/settings`, ...summaryRead, async (req, res) => {
    try {
      return res.json({ settings: await M.getSettings(pool, req.orgId) });
    } catch (e) {
      console.error('GET membership/settings:', e.message);
      return fail(res, 500, 'Could not load membership settings.');
    }
  });

  app.put(`${B}/settings`, ...adminFinance, async (req, res) => {
    const b = req.body || {};
    try {
      const before = await M.getSettings(pool, req.orgId);
      const next = { ...before };
      const errors = [];
      const pick = (k, check, msg) => { if (b[k] !== undefined) { if (check(b[k])) next[k] = b[k]; else errors.push(msg); } };
      const intIn = (lo, hi) => (v) => Number.isInteger(Number(v)) && Number(v) >= lo && Number(v) <= hi;
      const bool = (v) => typeof v === 'boolean';
      pick('year_mode', (v) => ['rolling', 'fixed'].includes(v), 'Year mode must be rolling or fixed year.');
      pick('fixed_start_month', intIn(1, 12), 'The year start month must be 1 to 12.');
      pick('fixed_start_day', intIn(1, 31), 'The year start day must be 1 to 31.');
      pick('renewal_window_days', intIn(0, 366), 'The renewal window must be 0 to 366 days.');
      pick('proration_mode', (v) => ['none', 'monthly'].includes(v), 'Proration must be none or monthly.');
      pick('grace_days', intIn(0, 366), 'Grace days must be 0 to 366.');
      pick('recognition_mode', (v) => ['spread', 'at_receipt'].includes(v), 'Recognition must be spread over the term or at receipt.');
      pick('payment_mode', (v) => ['test', 'live'].includes(v), 'Payment mode must be test or live.');
      for (const k of ['join_requires_approval', 'join_form_enabled', 'extra_gift_enabled', 'auto_renew_default', 'card_payments_enabled', 'monthly_instalments_enabled']) pick(k, bool, k.replace(/_/g, ' ') + ' must be true or false.');
      for (const k of ['deferred_dues_account_id', 'contribution_account_id', 'dues_revenue_account_id', 'default_program_id']) {
        pick(k, (v) => v === null || intId(v) != null, k.replace(/_id$/, '').replace(/_/g, ' ') + ' is not valid.');
      }
      pick('directory_fields', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), 'Directory fields must be a list.');
      pick('form_fields', (v) => Array.isArray(v), 'Form fields must be a list.');
      if (errors.length) return fail(res, 400, errors.join(' '));
      for (const k of ['fixed_start_month', 'fixed_start_day', 'renewal_window_days', 'grace_days']) next[k] = Number(next[k]);
      if (next.card_payments_enabled && (!before.card_payments_enabled || next.payment_mode !== before.payment_mode)) {
        const acct = (await Pay.loadAccounts(pool, req.orgId, 'stripe')).find((a) => a.mode === next.payment_mode);
        if (!acct || !acct.secret_enc || !acct.webhook_secret_enc) {
          return fail(res, 400, 'Enter the ' + next.payment_mode + ' secret key and webhook secret under Card payments before turning card payments on in ' + next.payment_mode + ' mode.');
        }
      }
      for (const k of ['deferred_dues_account_id', 'contribution_account_id', 'dues_revenue_account_id']) {
        if (next[k] != null && next[k] !== before[k]) {
          const a = await pool.query('SELECT 1 FROM org_accounts WHERE id = $1 AND org_id = $2', [next[k], req.orgId]);
          if (!a.rows.length) return fail(res, 400, 'One of the chosen accounts is not in this workspace. Pick it again from the list.');
        }
      }
      if (next.default_program_id != null && next.default_program_id !== before.default_program_id) {
        const p = await pool.query('SELECT 1 FROM org_programs WHERE id = $1 AND org_id = $2', [next.default_program_id, req.orgId]);
        if (!p.rows.length) return fail(res, 400, 'The chosen program is not in this workspace. Pick it again from the list.');
      }
      const cols = M.SETTINGS_FIELDS;
      const vals = cols.map((k) => (k === 'form_fields' ? JSON.stringify(next[k]) : next[k]));
      await pool.query(
        `INSERT INTO org_membership_settings (org_id, ${cols.join(', ')}, updated_by, updated_at)
         VALUES ($1, ${cols.map((_, i) => '$' + (i + 2)).join(', ')}, $${cols.length + 2}, now())
         ON CONFLICT (org_id) DO UPDATE SET ${cols.map((k) => `${k} = EXCLUDED.${k}`).join(', ')}, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [req.orgId, ...vals, userIdOf(req)]);
      const fields = diffFields(
        Object.fromEntries(cols.map((k) => [k, typeof before[k] === 'object' && before[k] !== null ? JSON.stringify(before[k]) : before[k]])),
        Object.fromEntries(cols.map((k) => [k, typeof next[k] === 'object' && next[k] !== null ? JSON.stringify(next[k]) : next[k]])), cols);
      if (fields.length) await audit(req, 'update', 'org_membership_settings', req.orgId, { fields });
      return res.json({ settings: await M.getSettings(pool, req.orgId) });
    } catch (e) {
      console.error('PUT membership/settings:', e.message);
      return fail(res, 500, 'Could not save membership settings.');
    }
  });

  // --- Tiers ---

  function parseTier(b, existing) {
    const out = {};
    if (b.name !== undefined || !existing) {
      out.name = text(b.name);
      if (!out.name) return { error: 'Give the tier a name.' };
    }
    if (b.description !== undefined) out.description = text(b.description);
    if (b.applies_to !== undefined) {
      if (!['individual', 'organization', 'either'].includes(b.applies_to)) return { error: 'A tier applies to individuals, organizations or either.' };
      out.applies_to = b.applies_to;
    }
    for (const k of ['pay_what_you_can', 'eligibility_required']) if (b[k] !== undefined) out[k] = !!b[k];
    for (const k of ['min_price', 'suggested_price', 'budget_low', 'budget_high', 'benefit_value']) {
      if (b[k] !== undefined || b[k + '_cents'] !== undefined) {
        const c = cents(b, k);
        if (c.error) return { error: c.error };
        out[k + '_cents'] = c.value;
      }
    }
    if (b.seats_included !== undefined) {
      const n = Number(b.seats_included);
      if (!Number.isInteger(n) || n < 0) return { error: 'Seats included must be a whole number, zero or more.' };
      out.seats_included = n;
    }
    if (b.benefits !== undefined) {
      const list = Array.isArray(b.benefits) ? b.benefits : String(b.benefits || '').split('\n');
      out.benefits = list.map((x) => String(x).trim()).filter(Boolean);
    }
    if (b.eligibility_statement !== undefined) out.eligibility_statement = text(b.eligibility_statement);
    if (b.display_order !== undefined) out.display_order = Number(b.display_order) || 0;
    for (const k of ['revenue_account_id', 'program_id']) {
      if (b[k] !== undefined) {
        if (b[k] === null || b[k] === '') out[k] = null;
        else if (intId(b[k]) == null) return { error: k.replace(/_id$/, '').replace(/_/g, ' ') + ' is not valid.' };
        else out[k] = intId(b[k]);
      }
    }
    const merged = { ...(existing || {}), ...out };
    if (merged.budget_low_cents != null && merged.budget_high_cents != null && Number(merged.budget_high_cents) < Number(merged.budget_low_cents)) {
      return { error: 'The top of the budget bracket must be at least the bottom.' };
    }
    if (merged.eligibility_required && !merged.eligibility_statement) return { error: 'Write the eligibility statement people tick to confirm.' };
    return { fields: out };
  }

  app.get(`${B}/tiers`, ...summaryRead, async (req, res) => {
    try {
      return res.json({ tiers: await M.listTiers(pool, req.orgId, { includeArchived: req.query.archived === 'true' }) });
    } catch (e) {
      console.error('GET membership/tiers:', e.message);
      return fail(res, 500, 'Could not load tiers.');
    }
  });

  app.post(`${B}/tiers`, ...adminFinance, async (req, res) => {
    const b = req.body || {};
    const parsed = parseTier(b, null);
    if (parsed.error) return fail(res, 400, parsed.error);
    const price = cents(b, 'price');
    if (price.error) return fail(res, 400, price.error);
    if (price.value == null) return fail(res, 400, 'Enter a price. Use 0 for a free tier.');
    const effective = day(b.effective_on) || M.today();
    try {
      const tier = await inTransaction(async (client) => {
        const f = parsed.fields;
        const cols = Object.keys(f);
        const t = await client.query(
          `INSERT INTO org_membership_tiers (org_id, ${cols.join(', ')}) VALUES ($1, ${cols.map((_, i) => '$' + (i + 2)).join(', ')}) RETURNING *`,
          [req.orgId, ...cols.map((k) => f[k])]);
        await client.query(
          'INSERT INTO org_membership_tier_prices (org_id, tier_id, effective_on, price_cents, created_by) VALUES ($1, $2, $3, $4, $5)',
          [req.orgId, t.rows[0].id, effective, price.value, userIdOf(req)]);
        return t.rows[0];
      });
      await audit(req, 'create', 'org_membership_tiers', tier.id, { metadata: { name: tier.name, price_cents: price.value } });
      const tiers = await M.listTiers(pool, req.orgId, { includeArchived: true });
      return res.status(201).json({ tier: tiers.find((t) => t.id === tier.id) });
    } catch (e) {
      console.error('POST membership/tiers:', e.message);
      return fail(res, 500, 'Could not create the tier.');
    }
  });

  app.patch(`${B}/tiers/:id`, ...adminFinance, async (req, res) => {
    const id = intId(req.params.id);
    if (!id) return fail(res, 400, 'That tier was not found.');
    try {
      const existing = await loadTier(req.orgId, id);
      if (!existing) return fail(res, 404, 'That tier was not found.');
      const parsed = parseTier(req.body || {}, existing);
      if (parsed.error) return fail(res, 400, parsed.error);
      const f = parsed.fields;
      const cols = Object.keys(f);
      if (!cols.length) return fail(res, 400, 'Nothing to change.');
      const r = await pool.query(
        `UPDATE org_membership_tiers SET ${cols.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now()
          WHERE id = $${cols.length + 1} AND org_id = $${cols.length + 2} RETURNING *`,
        [...cols.map((k) => f[k]), id, req.orgId]);
      const fields = diffFields(existing, r.rows[0], TIER_FIELDS.filter((k) => cols.includes(k)));
      if (fields.length) await audit(req, 'update', 'org_membership_tiers', id, { fields });
      const tiers = await M.listTiers(pool, req.orgId, { includeArchived: true });
      return res.json({ tier: tiers.find((t) => t.id === id) });
    } catch (e) {
      console.error('PATCH membership/tiers:', e.message);
      return fail(res, 500, 'Could not save the tier.');
    }
  });

  app.post(`${B}/tiers/:id/prices`, ...adminFinance, async (req, res) => {
    const id = intId(req.params.id);
    const b = req.body || {};
    const price = cents(b, 'price');
    if (price.error) return fail(res, 400, price.error);
    if (price.value == null) return fail(res, 400, 'Enter the new price.');
    const effective = day(b.effective_on);
    if (!effective) return fail(res, 400, 'Enter the date the new price starts.');
    try {
      if (!id || !(await loadTier(req.orgId, id))) return fail(res, 404, 'That tier was not found.');
      const r = await pool.query(
        `INSERT INTO org_membership_tier_prices (org_id, tier_id, effective_on, price_cents, created_by) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (tier_id, effective_on) DO UPDATE SET price_cents = EXCLUDED.price_cents, created_by = EXCLUDED.created_by, created_at = now()
         RETURNING id`,
        [req.orgId, id, effective, price.value, userIdOf(req)]);
      await audit(req, 'update', 'org_membership_tiers', id, { fields: [{ fieldName: 'price_from_' + effective, oldValue: null, newValue: String(price.value) }], metadata: { price_row: r.rows[0].id } });
      const tiers = await M.listTiers(pool, req.orgId, { includeArchived: true });
      return res.status(201).json({ tier: tiers.find((t) => t.id === id) });
    } catch (e) {
      console.error('POST membership/tiers/:id/prices:', e.message);
      return fail(res, 500, 'Could not save the price.');
    }
  });

  for (const [action, archived] of [['archive', true], ['restore', false]]) {
    app.post(`${B}/tiers/:id/${action}`, ...adminFinance, async (req, res) => {
      const id = intId(req.params.id);
      try {
        const r = await pool.query(
          `UPDATE org_membership_tiers SET archived_at = ${archived ? 'now()' : 'NULL'}, updated_at = now()
            WHERE id = $1 AND org_id = $2 RETURNING id`, [id, req.orgId]);
        if (!r.rows.length) return fail(res, 404, 'That tier was not found.');
        await audit(req, 'update', 'org_membership_tiers', id, { fields: [{ fieldName: 'archived', oldValue: String(!archived), newValue: String(archived) }] });
        return res.json({ ok: true });
      } catch (e) {
        console.error('POST membership/tiers/' + action + ':', e.message);
        return fail(res, 500, 'Could not change the tier.');
      }
    });
  }

  // --- Dues members ---

  app.get(`${B}/dues-members`, ...read, async (req, res) => {
    try {
      const rows = await M.listDuesMembers(pool, req.orgId, M.parseListFilters(req.query || {}));
      return res.json({ dues_members: rows });
    } catch (e) {
      console.error('GET membership/dues-members:', e.message);
      return fail(res, 500, 'Could not load dues members.');
    }
  });

  app.get(`${B}/dues-members/export.csv`, ...adminFinance, async (req, res) => {
    try {
      const rows = await M.listDuesMembers(pool, req.orgId, M.parseListFilters(req.query || {}));
      const head = ['display_name', 'first_name', 'last_name', 'kind', 'email', 'phone', 'mailing_address', 'status', 'tier', 'term_start', 'term_end', 'balance', 'tags'];
      let csv = head.join(',') + '\r\n';
      for (const r of rows) {
        csv += [r.display_name, r.first_name, r.last_name, r.kind, r.email, r.phone, r.mailing_address, r.status,
          r.term && r.term.tier_name, r.term && r.term.starts_on, r.term && r.term.ends_on,
          r.term ? (r.term.balance_cents / 100).toFixed(2) : '', (r.tags || []).join(';')].map(csvCell).join(',') + '\r\n';
      }
      await audit(req, 'create', 'org_membership_exports', req.orgId, { metadata: { rows: rows.length, filters: req.query || {} } });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="dues-members-${M.today()}.csv"`);
      return res.send(csv);
    } catch (e) {
      console.error('GET membership/dues-members/export.csv:', e.message);
      return fail(res, 500, 'Could not export dues members.');
    }
  });

  app.get(`${B}/dues-members/:id`, ...read, async (req, res) => {
    const id = intId(req.params.id);
    if (!id) return fail(res, 404, 'That dues member was not found.');
    try {
      const c = await pool.query(
        `SELECT c.id, c.display_name, c.first_name, c.last_name, c.kind, c.org_type, c.email, c.additional_emails, c.phone,
                c.mailing_address, c.website, c.tags, c.is_active
           FROM org_constituents c
          WHERE c.id = $1 AND c.org_id = $2
            AND (EXISTS (SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = c.id AND r.role = 'dues_member')
                 OR EXISTS (SELECT 1 FROM org_membership_terms t WHERE t.constituent_id = c.id))`, [id, req.orgId]);
      if (!c.rows.length) return fail(res, 404, 'That dues member was not found.');
      const settings = await M.getSettings(pool, req.orgId);
      const st = (await M.statusByContact(pool, req.orgId, { contactIds: [id], settings })).get(id) || { status: null, term: null, terms: [] };
      const termIds = st.terms.map((t) => t.id);
      const pays = await pool.query(
        `SELECT p.id, p.term_id, p.kind, p.method, p.amount_cents, p.discount_cents, p.discount_reason, p.reason, p.payment_date,
                p.posting_status, p.ledger_transaction_id, p.refund_of_id, p.notes, p.processor_ref, p.approved_at,
                p.recorded_by_user_id, ub.email AS recorded_by, ua.email AS approved_by, p.created_at
           FROM org_membership_payments p
           LEFT JOIN users ub ON ub.id = p.recorded_by_user_id
           LEFT JOIN users ua ON ua.id = p.approved_by
          WHERE p.org_id = $1 AND p.term_id = ANY($2::int[]) ORDER BY p.payment_date DESC, p.id DESC`, [req.orgId, termIds]);
      const paymentIds = pays.rows.map((p) => p.id);
      const hist = await pool.query(
        `SELECT a.occurred_at, a.action, a.table_name, a.record_id, a.field_name, a.old_value, a.new_value, a.metadata, u.email AS by_email
           FROM org_audit_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.org_id = $1 AND ((a.table_name = 'org_membership_terms' AND a.record_id = ANY($2::bigint[]))
                                OR (a.table_name = 'org_membership_payments' AND a.record_id = ANY($3::bigint[])))
          ORDER BY a.occurred_at DESC, a.id DESC LIMIT 200`, [req.orgId, termIds, paymentIds]);
      const seats = await pool.query(
        `SELECT s.id, s.term_id, s.label, s.starts_on, s.ends_on, c2.display_name
           FROM org_membership_seats s JOIN org_constituents c2 ON c2.id = s.constituent_id
          WHERE s.org_id = $1 AND s.term_id = ANY($2::int[]) ORDER BY s.starts_on`, [req.orgId, termIds]);
      return res.json({
        dues_member: c.rows[0],
        status: st.status,
        current_term_id: st.term ? st.term.id : null,
        terms: st.terms.map((t) => ({ ...t, payments: undefined })),
        payments: pays.rows.map((p) => ({ ...p, payment_date: S.toDay(p.payment_date) })),
        seats: seats.rows,
        history: hist.rows.map((h) => ({ ...h, metadata: h.metadata ? { reason: h.metadata.reason || null, kind: h.metadata.kind || null } : null })),
        settings: { grace_days: settings.grace_days, year_mode: settings.year_mode },
      });
    } catch (e) {
      console.error('GET membership/dues-members/:id:', e.message);
      return fail(res, 500, 'Could not load this dues member.');
    }
  });

  app.post(`${B}/dues-members`, ...write, async (req, res) => {
    const b = req.body || {};
    const tierId = intId(b.tier_id);
    if (!tierId) return fail(res, 400, 'Pick a tier.');
    try {
      const tier = await loadTier(req.orgId, tierId);
      if (!tier) return fail(res, 400, 'That tier was not found. Pick a tier from the list.');
      let contactId = b.constituent_id != null && b.constituent_id !== '' ? intId(b.constituent_id) : null;
      let kind;
      let newContact = null;
      if (contactId) {
        const c = await pool.query('SELECT id, kind FROM org_constituents WHERE id = $1 AND org_id = $2', [contactId, req.orgId]);
        if (!c.rows.length) return fail(res, 400, 'That contact was not found. Pick one from the list or enter a new one.');
        kind = c.rows[0].kind;
        const has = await pool.query(
          `SELECT 1 FROM org_membership_terms WHERE constituent_id = $1 AND org_id = $2 AND status_override IS NULL AND ends_on >= CURRENT_DATE`, [contactId, req.orgId]);
        if (has.rows.length) return fail(res, 409, 'This contact already has a current term. Open their record to renew or change it.');
      } else {
        const c = b.contact || {};
        kind = c.kind === 'organization' ? 'organization' : 'individual';
        const first = text(c.first_name);
        const last = text(c.last_name);
        const name = text(c.display_name) || [first, last].filter(Boolean).join(' ');
        if (!name) return fail(res, 400, 'Enter a name for the new contact.');
        const email = text(c.email);
        if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) return fail(res, 400, 'That email address does not look right.');
        if (email) {
          const dup = await pool.query(
            `SELECT id, display_name FROM org_constituents WHERE org_id = $1 AND (lower(email) = lower($2) OR lower($2) = ANY (SELECT lower(x) FROM unnest(COALESCE(additional_emails, '{}')) x)) LIMIT 1`,
            [req.orgId, email]);
          if (dup.rows.length) return fail(res, 409, 'A contact with that email already exists. Pick that contact instead.', { constituent_id: dup.rows[0].id, display_name: dup.rows[0].display_name });
        }
        newContact = { kind, display_name: name, first_name: kind === 'individual' ? first : null, last_name: kind === 'individual' ? last : null, email, phone: text(c.phone), mailing_address: text(c.mailing_address) };
      }
      const t = await M.planTerm(pool, req.orgId, tier, kind, b, null);
      if (t.error) return fail(res, 400, t.error);
      const term = await inTransaction(async (client) => {
        if (newContact) {
          const ins = await client.query(
            `INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, phone, mailing_address, kind)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [req.orgId, newContact.display_name, newContact.first_name, newContact.last_name, newContact.email, newContact.phone, newContact.mailing_address, newContact.kind]);
          contactId = ins.rows[0].id;
        }
        return M.insertTerm(client, { orgId: req.orgId, userId: userIdOf(req), contactId, tier, plan: t, source: b.source === 'import' ? 'import' : 'staff', autoRenew: b.auto_renew });
      });
      if (newContact) await audit(req, 'create', 'org_constituents', contactId, { metadata: { via: 'membership', kind: newContact.kind } });
      await audit(req, 'create', 'org_membership_terms', term.id, { metadata: { tier: tier.name, starts_on: t.dates.starts_on, ends_on: t.dates.ends_on, price_cents: t.price } });
      return res.status(201).json({ constituent_id: contactId, term_id: term.id });
    } catch (e) {
      console.error('POST membership/dues-members:', e.message);
      return fail(res, 500, 'Could not add the dues member.');
    }
  });

  app.post(`${B}/dues-members/:id/terms`, ...write, async (req, res) => {
    const contactId = intId(req.params.id);
    const b = req.body || {};
    try {
      const c = await pool.query('SELECT id, kind FROM org_constituents WHERE id = $1 AND org_id = $2', [contactId, req.orgId]);
      if (!c.rows.length) return fail(res, 404, 'That dues member was not found.');
      const terms = await M.loadTerms(pool, req.orgId, [contactId]);
      const prev = S.renewalBase(terms);
      const tier = await loadTier(req.orgId, intId(b.tier_id) || (prev && prev.tier_id));
      if (!tier) return fail(res, 400, 'Pick a tier.');
      if (prev) {
        const settings = await M.getSettings(pool, req.orgId);
        const later = terms.find((t) => t.starts_on > M.today() && t.status_override !== 'ended');
        if (later) return fail(res, 409, 'A renewal already exists for this dues member. Open it to record payment.');
        const asOf = day(b.on) || M.today();
        if (!S.renewalOpen(prev.ends_on, asOf, settings) && !b.starts_on) {
          return fail(res, 400, 'Renewals open ' + settings.renewal_window_days + ' days before the next term starts (' + S.addDays(prev.ends_on, 1) + ').');
        }
      }
      const t = await M.planTerm(pool, req.orgId, tier, c.rows[0].kind, b, prev);
      if (t.error) return fail(res, 400, t.error);
      const overlap = terms.find((x) => x.status_override !== 'ended' && x.starts_on <= t.dates.ends_on && x.ends_on >= t.dates.starts_on);
      if (overlap) return fail(res, 409, 'These dates overlap the term from ' + overlap.starts_on + ' to ' + overlap.ends_on + '. Change the dates or extend that term.');
      const term = await inTransaction((client) => M.insertTerm(client, { orgId: req.orgId, userId: userIdOf(req), contactId, tier, plan: t, source: prev ? 'renewal' : 'staff', renewsTermId: prev ? prev.id : null, autoRenew: b.auto_renew }));
      await audit(req, 'create', 'org_membership_terms', term.id, { metadata: { tier: tier.name, starts_on: t.dates.starts_on, ends_on: t.dates.ends_on, price_cents: t.price, renews: prev ? prev.id : null } });
      return res.status(201).json({ term_id: term.id });
    } catch (e) {
      console.error('POST membership/dues-members/:id/terms:', e.message);
      return fail(res, 500, 'Could not add the term.');
    }
  });

  // --- Payments, waivers, refunds ---

  app.post(`${B}/terms/:id/payments`, ...write, async (req, res) => {
    const b = req.body || {};
    const amount = cents(b, 'amount');
    if (amount.error) return fail(res, 400, amount.error);
    if (!amount.value) return fail(res, 400, 'Enter the amount received.');
    const discount = cents(b, 'discount');
    if (discount.error) return fail(res, 400, discount.error);
    const discountReason = text(b.discount_reason);
    if (discount.value && !discountReason) return fail(res, 400, 'Give the reason for the discount.');
    const method = b.method || 'check';
    if (!METHODS.includes(method)) return fail(res, 400, 'Method must be card, check, transfer, cash or other.');
    const paid = day(b.payment_date) || M.today();
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      if (term.status_override === 'ended') return fail(res, 409, 'This term has ended. Add a new term before recording payment.');
      const r = await pool.query(
        `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, discount_cents, discount_reason,
                                              payment_date, notes, recorded_by_user_id, posting_status)
         VALUES ($1, $2, $3, 'payment', $4, $5, $6, $7, $8, $9, $10, 'unposted') RETURNING id`,
        [req.orgId, term.id, term.constituent_id, method, amount.value, discount.value || 0, discountReason, paid, text(b.notes), userIdOf(req)]);
      await audit(req, 'create', 'org_membership_payments', r.rows[0].id, { metadata: { kind: 'payment', term: term.id, amount_cents: amount.value, discount_cents: discount.value || 0, reason: discountReason } });
      return res.status(201).json({ payment_id: r.rows[0].id });
    } catch (e) {
      console.error('POST membership/terms/:id/payments:', e.message);
      return fail(res, 500, 'Could not record the payment.');
    }
  });

  app.post(`${B}/terms/:id/waivers`, ...write, async (req, res) => {
    const b = req.body || {};
    const amount = cents(b, 'amount');
    if (amount.error) return fail(res, 400, amount.error);
    if (!amount.value) return fail(res, 400, 'Enter the amount to waive.');
    const reason = text(b.reason);
    if (!reason) return fail(res, 400, 'Give the reason for waiving dues.');
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      const r = await pool.query(
        `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, amount_cents, reason, payment_date, recorded_by_user_id, posting_status)
         VALUES ($1, $2, $3, 'waiver', $4, $5, $6, $7, 'not_applicable') RETURNING id`,
        [req.orgId, term.id, term.constituent_id, amount.value, reason, day(b.payment_date) || M.today(), userIdOf(req)]);
      await audit(req, 'create', 'org_membership_payments', r.rows[0].id, { metadata: { kind: 'waiver', term: term.id, amount_cents: amount.value, reason } });
      return res.status(201).json({ payment_id: r.rows[0].id, needs_approval: true });
    } catch (e) {
      console.error('POST membership/terms/:id/waivers:', e.message);
      return fail(res, 500, 'Could not record the waiver.');
    }
  });

  app.post(`${B}/payments/:id/approve`, ...write, async (req, res) => {
    try {
      const r = await pool.query('SELECT * FROM org_membership_payments WHERE id = $1 AND org_id = $2', [intId(req.params.id), req.orgId]);
      const p = r.rows[0];
      if (!p || p.kind !== 'waiver') return fail(res, 404, 'That waiver was not found.');
      if (p.approved_at) return fail(res, 409, 'This waiver is already approved.');
      if (Number(p.recorded_by_user_id) === Number(userIdOf(req))) return fail(res, 403, 'Someone other than the person who entered this waiver must approve it.', { code: 'own_waiver' });
      await pool.query('UPDATE org_membership_payments SET approved_by = $1, approved_at = now() WHERE id = $2', [userIdOf(req), p.id]);
      await audit(req, 'update', 'org_membership_payments', p.id, { fields: [{ fieldName: 'approved', oldValue: 'false', newValue: 'true' }], metadata: { kind: 'waiver', term: p.term_id } });
      return res.json({ ok: true });
    } catch (e) {
      console.error('POST membership/payments/:id/approve:', e.message);
      return fail(res, 500, 'Could not approve the waiver.');
    }
  });

  app.post(`${B}/payments/:id/refund`, ...write, async (req, res) => {
    const b = req.body || {};
    const reason = text(b.reason);
    if (!reason) return fail(res, 400, 'Give the reason for the refund.');
    const amount = cents(b, 'amount');
    if (amount.error) return fail(res, 400, amount.error);
    const method = b.method || 'check';
    if (!METHODS.includes(method)) return fail(res, 400, 'Method must be card, check, transfer, cash or other.');
    try {
      const r = await pool.query('SELECT * FROM org_membership_payments WHERE id = $1 AND org_id = $2', [intId(req.params.id), req.orgId]);
      const p = r.rows[0];
      if (!p || p.kind !== 'payment' || p.posting_status === 'void') return fail(res, 404, 'That payment was not found.');
      const prior = await pool.query(
        `SELECT COALESCE(SUM(amount_cents), 0)::int AS n FROM org_membership_payments WHERE refund_of_id = $1 AND posting_status <> 'void'`, [p.id]);
      const left = Number(p.amount_cents) - prior.rows[0].n;
      const value = amount.value == null ? left : amount.value;
      if (value <= 0) return fail(res, 409, 'This payment has already been refunded in full.');
      if (value > left) return fail(res, 400, 'You can refund up to ' + (left / 100).toFixed(2) + ' on this payment.');
      let processorRef = null;
      let refundMethod = method;
      if (p.method === 'card' && p.processor_ref) {
        let out;
        try {
          out = await Pay.refundThroughProvider(pool, { orgId: req.orgId, paymentRef: p.processor_ref, amountCents: value });
        } catch (e) {
          console.error('membership refund through provider:', e.message);
          return fail(res, 502, 'The payment provider did not accept the refund: ' + e.message + ' Nothing was recorded.');
        }
        if (out.error) return fail(res, 409, out.error);
        processorRef = out.id;
        refundMethod = 'card';
      }
      const ins = await pool.query(
        `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, reason, refund_of_id, payment_date,
                                              recorded_by_user_id, posting_status, processor_ref)
         VALUES ($1, $2, $3, 'refund', $4, $5, $6, $7, $8, $9, 'unposted', $10) RETURNING id`,
        [req.orgId, p.term_id, p.constituent_id, refundMethod, value, reason, p.id, day(b.payment_date) || M.today(), userIdOf(req), processorRef]);
      await audit(req, 'create', 'org_membership_payments', ins.rows[0].id, { metadata: { kind: 'refund', refund_of: p.id, term: p.term_id, amount_cents: value, reason } });
      return res.status(201).json({ payment_id: ins.rows[0].id });
    } catch (e) {
      console.error('POST membership/payments/:id/refund:', e.message);
      return fail(res, 500, 'Could not record the refund.');
    }
  });

  // --- Extend and end ---

  app.post(`${B}/terms/:id/extend`, ...write, async (req, res) => {
    const b = req.body || {};
    const reason = text(b.reason);
    if (!reason) return fail(res, 400, 'Give the reason for the extension, for example hardship or a gift membership.');
    const endsOn = day(b.ends_on);
    if (!endsOn) return fail(res, 400, 'Enter the new end date.');
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      if (term.status_override === 'ended') return fail(res, 409, 'This term has ended and cannot be extended. Add a new term instead.');
      const oldEnd = S.toDay(term.ends_on);
      if (endsOn <= oldEnd) return fail(res, 400, 'The new end date must be after ' + oldEnd + '.');
      const next = await pool.query(
        `SELECT starts_on FROM org_membership_terms WHERE constituent_id = $1 AND org_id = $2 AND id <> $3 AND status_override IS NULL
            AND starts_on > $4 ORDER BY starts_on LIMIT 1`, [term.constituent_id, req.orgId, term.id, oldEnd]);
      if (next.rows.length && endsOn >= S.toDay(next.rows[0].starts_on)) {
        return fail(res, 409, 'The next term starts on ' + S.toDay(next.rows[0].starts_on) + '. Pick an end date before it.');
      }
      await pool.query('UPDATE org_membership_terms SET ends_on = $1, extension_count = extension_count + 1, updated_at = now() WHERE id = $2', [endsOn, term.id]);
      await audit(req, 'update', 'org_membership_terms', term.id, { fields: [{ fieldName: 'ends_on', oldValue: oldEnd, newValue: endsOn }], metadata: { reason, extension: Number(term.extension_count) + 1 } });
      return res.json({ ok: true, ends_on: endsOn });
    } catch (e) {
      console.error('POST membership/terms/:id/extend:', e.message);
      return fail(res, 500, 'Could not extend the term.');
    }
  });

  app.post(`${B}/terms/:id/end`, ...write, async (req, res) => {
    const b = req.body || {};
    const reason = text(b.reason);
    if (!reason) return fail(res, 400, 'Give the reason for ending this membership.');
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      if (term.status_override === 'ended') return fail(res, 409, 'This term has already ended.');
      const endedOn = day(b.ended_on) || M.today();
      await pool.query(
        `UPDATE org_membership_terms SET status_override = 'ended', status_reason = $1, ended_on = $2, ended_by = $3, updated_at = now() WHERE id = $4`,
        [reason, endedOn, userIdOf(req), term.id]);
      await audit(req, 'update', 'org_membership_terms', term.id, { fields: [{ fieldName: 'status', oldValue: null, newValue: 'ended' }], metadata: { reason, ended_on: endedOn } });
      return res.json({ ok: true });
    } catch (e) {
      console.error('POST membership/terms/:id/end:', e.message);
      return fail(res, 500, 'Could not end the term.');
    }
  });

  // --- Card payments: provider account ---

  app.get(`${B}/payment-account`, ...adminFinance, async (req, res) => {
    try {
      const accounts = await Pay.loadAccounts(pool, req.orgId, 'stripe');
      const base0 = (process.env.BASE_URL || '').replace(/\/$/, '');
      return res.json({
        accounts: accounts.map(Pay.publicAccount),
        webhook_url: base0 + '/api/public/' + encodeURIComponent(req.params.slug) + '/payments/stripe/webhook',
      });
    } catch (e) {
      console.error('GET membership/payment-account:', e.message);
      return fail(res, 500, 'Could not load the card payment account.');
    }
  });

  app.put(`${B}/payment-account`, ...adminFinance, async (req, res) => {
    const b = req.body || {};
    const mode = b.mode === 'live' ? 'live' : b.mode === 'test' ? 'test' : null;
    if (!mode) return fail(res, 400, 'Choose test or live.');
    const secret = text(b.secret_key);
    const webhookSecret = text(b.webhook_secret);
    const accountRef = text(b.account_ref);
    if (secret && !new RegExp('^(sk|rk)_' + mode + '_[A-Za-z0-9]{8,}$').test(secret)) {
      return fail(res, 400, 'That does not look like a ' + mode + ' secret key. It starts with sk_' + mode + '_.');
    }
    if (webhookSecret && !/^whsec_[A-Za-z0-9]{8,}$/.test(webhookSecret)) return fail(res, 400, 'That does not look like a webhook signing secret. It starts with whsec_.');
    if (!secret && !webhookSecret && !accountRef) return fail(res, 400, 'Nothing to save.');
    try {
      await Pay.saveAccount(pool, { orgId: req.orgId, userId: userIdOf(req), provider: 'stripe', mode, accountRef, secret, webhookSecret });
    } catch (e) {
      console.error('PUT membership/payment-account:', e.message);
      return fail(res, 500, /ENCRYPTION_KEY/.test(e.message) ? 'The server has no key to store credentials safely. Ask the platform owner to set it.' : 'Could not save the card payment account.');
    }
    await audit(req, 'update', 'org_payment_accounts', req.orgId, { metadata: { mode, secret_key: secret ? 'changed' : 'kept', webhook_secret: webhookSecret ? 'changed' : 'kept' } });
    const accounts = await Pay.loadAccounts(pool, req.orgId, 'stripe');
    return res.json({ accounts: accounts.map(Pay.publicAccount) });
  });

  // --- Invoices for terms (created through the existing Sales invoice route) ---

  app.post(`${B}/terms/:id/invoice-draft`, ...write, async (req, res) => {
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      if (term.invoice_id) return fail(res, 409, 'This term already has an invoice.', { invoice_id: term.invoice_id });
      const owed = (await M.loadTerms(pool, req.orgId, [term.constituent_id])).find((t) => t.id === term.id);
      const amount = Math.max(0, owed.price_cents - owed.covered_cents);
      if (!amount) return fail(res, 409, 'Nothing is owed on this term.');
      const tier = term.tier_id ? await loadTier(req.orgId, term.tier_id) : null;
      const settings = await M.getSettings(pool, req.orgId);
      const accountId = (tier && tier.revenue_account_id) || settings.dues_revenue_account_id;
      const programId = (tier && tier.program_id) || settings.default_program_id;
      if (!accountId || !programId) return fail(res, 400, 'Set a revenue account and program on the tier, or the defaults in Membership settings, before invoicing.');
      const added = await pool.query(
        `SELECT 1 FROM org_contact_roles r WHERE r.constituent_id = $1 AND r.role = 'customer' AND r.starts_on <= CURRENT_DATE AND (r.ends_on IS NULL OR r.ends_on > CURRENT_DATE)`, [term.constituent_id]);
      if (!added.rows.length) {
        await inTransaction((client) => addContactRoles(client, req.orgId, term.constituent_id, ['customer']));
        await audit(req, 'update', 'org_constituents', term.constituent_id, { fields: [{ fieldName: 'roles', oldValue: null, newValue: '+customer' }], metadata: { via: 'membership invoice', term: term.id } });
      }
      return res.json({
        constituent_id: term.constituent_id,
        invoice_date: M.today(),
        due_date: S.addDays(M.today(), 30),
        reference: 'Membership ' + S.toDay(term.starts_on) + ' to ' + S.toDay(term.ends_on),
        lines: [{ account_id: accountId, program_id: programId, quantity: 1, unit_amount_cents: amount,
          description: 'Membership dues' + (tier ? ': ' + tier.name : '') + ', ' + S.toDay(term.starts_on) + ' to ' + S.toDay(term.ends_on) }],
      });
    } catch (e) {
      console.error('POST membership/terms/:id/invoice-draft:', e.message);
      return fail(res, 500, 'Could not prepare the invoice.');
    }
  });

  app.post(`${B}/terms/:id/invoice`, ...write, async (req, res) => {
    const invoiceId = intId((req.body || {}).invoice_id);
    if (!invoiceId) return fail(res, 400, 'Give the invoice to link.');
    try {
      const term = await loadTerm(req, intId(req.params.id));
      if (!term) return fail(res, 404, 'That term was not found.');
      if (term.invoice_id) return fail(res, 409, 'This term already has an invoice.');
      const inv = await pool.query('SELECT id, constituent_id, status FROM org_invoices WHERE id = $1 AND org_id = $2', [invoiceId, req.orgId]);
      if (!inv.rows.length) return fail(res, 404, 'That invoice was not found.');
      if (Number(inv.rows[0].constituent_id) !== Number(term.constituent_id)) return fail(res, 400, 'That invoice is for a different contact.');
      if (['void', 'written_off'].includes(inv.rows[0].status)) return fail(res, 400, 'That invoice is void or written off.');
      await pool.query('UPDATE org_membership_terms SET invoice_id = $1, updated_at = now() WHERE id = $2', [invoiceId, term.id]);
      await audit(req, 'update', 'org_membership_terms', term.id, { fields: [{ fieldName: 'invoice_id', oldValue: null, newValue: String(invoiceId) }] });
      return res.json({ ok: true });
    } catch (e) {
      console.error('POST membership/terms/:id/invoice:', e.message);
      return fail(res, 500, 'Could not link the invoice.');
    }
  });

  // --- Join requests from the public form ---

  app.get(`${B}/join-requests`, ...read, async (req, res) => {
    try {
      const r = await pool.query(
        `SELECT j.id, j.status, j.kind, j.email, j.details, j.price_cents, j.extra_gift_cents, j.created_at, j.confirmed_at, t.name AS tier_name
           FROM org_membership_join_requests j LEFT JOIN org_membership_tiers t ON t.id = j.tier_id
          WHERE j.org_id = $1 AND j.status = 'awaiting_approval' ORDER BY j.confirmed_at`, [req.orgId]);
      return res.json({ join_requests: r.rows.map((x) => ({ ...x, display_name: (x.details || {}).display_name || null, details: undefined,
        phone: (x.details || {}).phone || null, mailing_address: (x.details || {}).mailing_address || null, annual_budget_cents: (x.details || {}).annual_budget_cents ?? null })) });
    } catch (e) {
      console.error('GET membership/join-requests:', e.message);
      return fail(res, 500, 'Could not load join requests.');
    }
  });

  app.post(`${B}/join-requests/:id/approve`, ...write, async (req, res) => {
    try {
      const r = await pool.query('SELECT status FROM org_membership_join_requests WHERE id = $1 AND org_id = $2', [intId(req.params.id), req.orgId]);
      if (!r.rows.length) return fail(res, 404, 'That join request was not found.');
      if (r.rows[0].status !== 'awaiting_approval') return fail(res, 409, 'This join request is not waiting for approval.');
      const out = await J.acceptJoin(pool, { orgId: req.orgId, requestId: intId(req.params.id), userId: userIdOf(req) });
      return res.status(out.httpStatus).json(out.body);
    } catch (e) {
      console.error('POST membership/join-requests/:id/approve:', e.message);
      return fail(res, 500, 'Could not approve the join request.');
    }
  });

  app.post(`${B}/join-requests/:id/decline`, ...write, async (req, res) => {
    const reason = text((req.body || {}).reason);
    if (!reason) return fail(res, 400, 'Give the reason for declining.');
    try {
      const r = await pool.query(
        `UPDATE org_membership_join_requests SET status = 'declined', decision_reason = $1, decided_by = $2, decided_at = now(), details = '{}'::jsonb
          WHERE id = $3 AND org_id = $4 AND status IN ('awaiting_approval', 'unconfirmed') RETURNING id`, [reason, userIdOf(req), intId(req.params.id), req.orgId]);
      if (!r.rows.length) return fail(res, 404, 'That join request was not found or is already decided.');
      await audit(req, 'update', 'org_membership_join_requests', r.rows[0].id, { fields: [{ fieldName: 'status', oldValue: null, newValue: 'declined' }], metadata: { reason } });
      return res.json({ ok: true });
    } catch (e) {
      console.error('POST membership/join-requests/:id/decline:', e.message);
      return fail(res, 500, 'Could not decline the join request.');
    }
  });

  // --- Email: templates, message log, bulk email ---

  app.get(`${B}/templates`, ...read, async (req, res) => {
    try {
      return res.json({ templates: await Msg.loadTemplates(pool, req.orgId), merge_fields: Msg.MERGE_FIELDS });
    } catch (e) {
      console.error('GET membership/templates:', e.message);
      return fail(res, 500, 'Could not load the email templates.');
    }
  });

  app.put(`${B}/templates/:key`, ...write, async (req, res) => {
    const d = Msg.defaultOf(req.params.key);
    if (!d) return fail(res, 404, 'That email template was not found.');
    const b = req.body || {};
    const subject = text(b.subject);
    const body = b.body != null ? String(b.body).trim() : '';
    if (!subject) return fail(res, 400, 'Write a subject.');
    if (!body) return fail(res, 400, 'Write the message.');
    const offset = b.offset_days == null || b.offset_days === '' ? d.offset_days : Number(b.offset_days);
    if (!Number.isInteger(offset) || offset < -365 || offset > 365) return fail(res, 400, 'Days must be a whole number from -365 to 365.');
    if (d.anchor === 'failed' && offset < 0) return fail(res, 400, 'Failed-payment notices go out on or after the failure.');
    if (d.anchor === 'join' && offset < 0) return fail(res, 400, 'The welcome message goes out on or after joining.');
    try {
      const before = (await Msg.loadTemplates(pool, req.orgId)).find((t) => t.key === d.key);
      await pool.query(
        `INSERT INTO org_membership_templates (org_id, key, subject, body, offset_days, enabled, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now())
         ON CONFLICT (org_id, key) DO UPDATE SET subject = EXCLUDED.subject, body = EXCLUDED.body, offset_days = EXCLUDED.offset_days,
                                                 enabled = EXCLUDED.enabled, updated_by = EXCLUDED.updated_by, updated_at = now()`,
        [req.orgId, d.key, subject.slice(0, 300), body.slice(0, 20000), offset, b.enabled !== false, userIdOf(req)]);
      const fields = diffFields(before, { subject, body, offset_days: offset, enabled: b.enabled !== false }, ['subject', 'body', 'offset_days', 'enabled']);
      if (fields.length) await audit(req, 'update', 'org_membership_templates', req.orgId, { fields, metadata: { key: d.key } });
      return res.json({ templates: await Msg.loadTemplates(pool, req.orgId) });
    } catch (e) {
      console.error('PUT membership/templates/:key:', e.message);
      return fail(res, 500, 'Could not save the email template.');
    }
  });

  app.post(`${B}/templates/:key/reset`, ...write, async (req, res) => {
    if (!Msg.defaultOf(req.params.key)) return fail(res, 404, 'That email template was not found.');
    try {
      const r = await pool.query('DELETE FROM org_membership_templates WHERE org_id = $1 AND key = $2 RETURNING id', [req.orgId, req.params.key]);
      if (r.rows.length) await audit(req, 'update', 'org_membership_templates', req.orgId, { fields: [{ fieldName: 'reset', oldValue: req.params.key, newValue: 'default' }] });
      return res.json({ templates: await Msg.loadTemplates(pool, req.orgId) });
    } catch (e) {
      console.error('POST membership/templates/:key/reset:', e.message);
      return fail(res, 500, 'Could not reset the email template.');
    }
  });

  app.post(`${B}/templates/preview`, ...read, async (req, res) => {
    const b = req.body || {};
    try {
      const ws = (await pool.query('SELECT id, slug, display_name FROM coop_members WHERE id = $1', [req.orgId])).rows[0];
      const rows = await M.listDuesMembers(pool, req.orgId, { active: 'true' });
      const pick = rows.find((r) => r.id === intId(b.constituent_id)) || rows.find((r) => r.term) || null;
      const fields = pick
        ? await Msg.fieldsFor(pool, ws, pick, (await M.loadTerms(pool, req.orgId, [pick.id])).find((t) => t.id === pick.term.id), {})
        : { name: 'A dues member', first_name: 'Friend', workspace: ws.display_name, tier: 'Standard', starts_on: M.today(), ends_on: S.addDays(S.addMonths(M.today(), 12), -1), amount_due: '$0.00', renew_link: '', unsubscribe_link: '' };
      fields.unsubscribe_link = fields.unsubscribe_link || '(unsubscribe link)';
      return res.json({ subject: Msg.render(b.subject, fields), body: Msg.render(b.body, fields), sample: pick ? pick.display_name : null });
    } catch (e) {
      console.error('POST membership/templates/preview:', e.message);
      return fail(res, 500, 'Could not make the preview.');
    }
  });

  app.get(`${B}/messages`, ...read, async (req, res) => {
    const cid = req.query.constituent_id ? intId(req.query.constituent_id) : null;
    try {
      const r = await pool.query(
        `SELECT m.id, m.constituent_id, c.display_name, m.template_key, m.offset_days, m.subject, m.to_email, m.status, m.sent_at, m.delivered_at, m.opened_at, m.created_at
           FROM org_membership_messages m JOIN org_constituents c ON c.id = m.constituent_id
          WHERE m.org_id = $1 ${cid ? 'AND m.constituent_id = $2' : ''}
          ORDER BY m.created_at DESC, m.id DESC LIMIT 300`, cid ? [req.orgId, cid] : [req.orgId]);
      return res.json({ messages: r.rows });
    } catch (e) {
      console.error('GET membership/messages:', e.message);
      return fail(res, 500, 'Could not load the message log.');
    }
  });

  app.post(`${B}/bulk-email/preview`, ...write, async (req, res) => {
    try {
      const rows = await Msg.segment(pool, req.orgId, (req.body || {}).filters);
      let unsub = 0;
      for (const r of rows) if (await Msg.unsubscribed(pool, req.orgId, r.id)) unsub++;
      return res.json({ total: rows.length, no_email: rows.filter((r) => !r.email).length, unsubscribed: unsub });
    } catch (e) {
      console.error('POST membership/bulk-email/preview:', e.message);
      return fail(res, 500, 'Could not count the recipients.');
    }
  });

  app.post(`${B}/bulk-email`, ...write, async (req, res) => {
    const b = req.body || {};
    const subject = text(b.subject);
    const body = b.body != null ? String(b.body).trim() : '';
    const key = String(b.key || '').trim();
    if (!subject || !body) return fail(res, 400, 'Write a subject and a message.');
    if (!/^[a-z0-9]{6,40}$/.test(key)) return fail(res, 400, 'This send has no key. Reload the page and try again.');
    try {
      const ws = (await pool.query('SELECT id, slug, display_name FROM coop_members WHERE id = $1', [req.orgId])).rows[0];
      const out = await Msg.bulkSend(pool, ws, { filters: b.filters, subject: subject.slice(0, 300), body: body.slice(0, 20000), key, userId: userIdOf(req) });
      await audit(req, 'create', 'org_membership_messages', req.orgId, { metadata: { bulk: key, filters: b.filters || {}, ...out } });
      return res.json(out);
    } catch (e) {
      console.error('POST membership/bulk-email:', e.message);
      return fail(res, 500, 'Could not send the email.');
    }
  });

  // --- Renewals and summary ---

  app.get(`${B}/renewals`, ...read, async (req, res) => {
    const q = req.query || {};
    const days = q.days != null && q.days !== '' ? Number(q.days) : 60;
    if (!Number.isFinite(days) || days < 0 || days > 730) return fail(res, 400, 'Days to expiry must be 0 to 730.');
    const noContactDays = q.no_contact_days != null && q.no_contact_days !== '' ? Number(q.no_contact_days) : null;
    if (noContactDays != null && (!Number.isFinite(noContactDays) || noContactDays < 0)) return fail(res, 400, 'Days since last contact must be zero or more.');
    try {
      const rows = await M.listDuesMembers(pool, req.orgId, M.parseListFilters({ tier_id: q.tier_id }));
      return res.json({ renewals: M.renewalsFrom(rows, { days, noContactDays }) });
    } catch (e) {
      console.error('GET membership/renewals:', e.message);
      return fail(res, 500, 'Could not load renewals.');
    }
  });

  app.get(`${B}/summary`, ...summaryRead, async (req, res) => {
    try {
      const rows = await M.listDuesMembers(pool, req.orgId, { active: 'all' });
      const counts = Object.fromEntries(S.STATUSES.map((s) => [s, 0]));
      const byTier = {};
      for (const r of rows) {
        if (r.status) counts[r.status] += 1;
        if (r.status === 'active' && r.term) byTier[r.term.tier_name || 'No tier'] = (byTier[r.term.tier_name || 'No tier'] || 0) + 1;
      }
      const renewals = (d) => M.renewalsFrom(rows, { days: d }).filter((x) => x.status === 'active').length;
      const fyEndMonth = await getFiscalYearEndMonth(pool, req.orgId);
      const { startDate, endDate } = fyDateRange(fiscalYearForDate(new Date(), fyEndMonth), fyEndMonth);
      const dues = await pool.query(
        `SELECT COALESCE(SUM(CASE WHEN kind = 'payment' THEN amount_cents WHEN kind = 'refund' THEN -amount_cents ELSE 0 END), 0)::bigint AS net
           FROM org_membership_payments WHERE org_id = $1 AND posting_status <> 'void' AND payment_date::date BETWEEN $2 AND $3`,
        [req.orgId, startDate, endDate]);
      return res.json({
        counts, active_by_tier: byTier,
        dues_received_fiscal_year_cents: Number(dues.rows[0].net),
        renewals_due: { d30: renewals(30), d60: renewals(60), d90: renewals(90) },
      });
    } catch (e) {
      console.error('GET membership/summary:', e.message);
      return fail(res, 500, 'Could not load the membership summary.');
    }
  });
}

module.exports = { registerMembershipRoutes };
