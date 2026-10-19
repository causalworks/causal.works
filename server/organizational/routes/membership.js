'use strict';

// Membership staff routes: settings, tiers and prices, dues members (a filtered contact view), terms,
// payments, waivers, refunds, extensions, ending a term, renewals and the summary.

const { requireAuth } = require('../../auth');
const { requireOrganizationalAccess } = require('../middleware/requireOrganizationalAccess');
const { requireOrgMembership, requireOrgRole } = require('../middleware/requireOrgMembership');
const { requireWriteAccess, requireReadAccess } = require('../middleware/requireWriteAccess');
const { FINANCE_ROLES } = require('../lib/orgRoles');
const { logAudit, diffFields, reqMeta } = require('../lib/auditLog');
const { addContactRoles } = require('../lib/contactRoles');
const { fyDateRange, fiscalYearForDate, getFiscalYearEndMonth } = require('../lib/fiscalYear');
const S = require('../lib/membershipStatus');
const M = require('../lib/membership');

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

function cents(body, key) {
  const c = body[key + '_cents'];
  if (c !== undefined && c !== null && c !== '') {
    const n = Number(c);
    return Number.isInteger(n) && n >= 0 ? { value: n } : { error: key.replace(/_/g, ' ') + ' must be a whole number of cents, zero or more.' };
  }
  const d = body[key];
  if (d !== undefined && d !== null && String(d).trim() !== '') {
    const x = Number(String(d).replace(/[$,\s]/g, ''));
    return Number.isFinite(x) && x >= 0 ? { value: Math.round(x * 100) } : { error: key.replace(/_/g, ' ') + ' must be an amount of zero or more.' };
  }
  return { value: null };
}

function day(v) {
  const d = S.toDay(v);
  return d && !Number.isNaN(Date.parse(d + 'T00:00:00Z')) ? d : null;
}

function text(v) {
  if (v === undefined || v === null) return null;
  const t = String(v).trim();
  return t || null;
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
      for (const k of ['join_requires_approval', 'join_form_enabled', 'extra_gift_enabled', 'auto_renew_default', 'challenge_required']) pick(k, bool, k.replace(/_/g, ' ') + ' must be true or false.');
      for (const k of ['deferred_dues_account_id', 'contribution_account_id', 'dues_revenue_account_id', 'default_program_id']) {
        pick(k, (v) => v === null || intId(v) != null, k.replace(/_id$/, '').replace(/_/g, ' ') + ' is not valid.');
      }
      pick('directory_fields', (v) => Array.isArray(v) && v.every((x) => typeof x === 'string'), 'Directory fields must be a list.');
      pick('form_fields', (v) => Array.isArray(v), 'Form fields must be a list.');
      if (errors.length) return fail(res, 400, errors.join(' '));
      for (const k of ['fixed_start_month', 'fixed_start_day', 'renewal_window_days', 'grace_days']) next[k] = Number(next[k]);
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

  // Price, contribution and dates for a new term on a tier.
  async function termTerms(req, tier, contactKind, b, baseTerm) {
    if (tier.archived_at) return { error: 'That tier is archived. Pick a current tier.' };
    if (tier.applies_to === 'individual' && contactKind === 'organization') return { error: 'That tier is for individuals. Pick a tier for organizations.' };
    if (tier.applies_to === 'organization' && contactKind === 'individual') return { error: 'That tier is for organizations. Pick a tier for individuals.' };
    if (tier.eligibility_required && b.eligibility_confirmed !== true) return { error: 'Tick the eligibility statement to confirm it applies.' };
    const settings = await M.getSettings(pool, req.orgId);
    const asOf = day(b.on) || M.today();
    let dates;
    const startGiven = day(b.starts_on);
    if (baseTerm) dates = S.renewalTermDates(S.toDay(baseTerm.ends_on), asOf, settings);
    else dates = S.joinTermDates(startGiven || asOf, settings);
    if (startGiven && baseTerm) dates = { ...dates, starts_on: startGiven, ends_on: day(b.ends_on) || S.addDays(S.addMonths(startGiven, 12), -1), year_start: startGiven };
    if (day(b.ends_on)) dates.ends_on = day(b.ends_on);
    if (dates.ends_on < dates.starts_on) return { error: 'The end date must be on or after the start date.' };
    const listPrice = await M.tierPriceOn(pool, tier.id, dates.starts_on);
    if (listPrice == null) return { error: 'That tier has no price yet. Set a price on the tier first.' };
    const followsOn = baseTerm && dates.starts_on === S.addDays(S.toDay(baseTerm.ends_on), 1);
    let price = followsOn ? listPrice : S.proratedPriceCents(listPrice, dates.starts_on, dates.year_start, settings);
    const chosen = cents(b, 'price');
    if (chosen.error) return { error: chosen.error };
    if (tier.pay_what_you_can) {
      if (chosen.value == null) return { error: 'Enter the amount for this pay-what-you-can tier.' };
      if (tier.min_price_cents != null && chosen.value < Number(tier.min_price_cents)) {
        return { error: 'The lowest amount for this tier is ' + (Number(tier.min_price_cents) / 100).toFixed(2) + '.' };
      }
      price = chosen.value;
    } else if (chosen.value != null && chosen.value !== price) {
      return { error: 'This tier has a set price. Record a discount on the payment, or waive part of it, instead of changing the price.' };
    }
    const benefit = tier.benefit_value_cents != null ? Number(tier.benefit_value_cents) : (tier.pay_what_you_can ? Number(tier.suggested_price_cents ?? tier.min_price_cents ?? price) : price);
    return { dates, price, contribution: Math.max(0, price - benefit), settings };
  }

  async function insertTerm(client, req, contactId, tier, t, source, renewsTermId, b) {
    const r = await client.query(
      `INSERT INTO org_membership_terms (org_id, constituent_id, tier_id, starts_on, ends_on, price_cents, contribution_cents, source,
                                         auto_renew, renews_term_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [req.orgId, contactId, tier.id, t.dates.starts_on, t.dates.ends_on, t.price, t.contribution, source,
       b.auto_renew !== undefined ? !!b.auto_renew : !!t.settings.auto_renew_default, renewsTermId, userIdOf(req)]);
    await addContactRoles(client, req.orgId, contactId, ['dues_member']);
    return r.rows[0];
  }

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
      const t = await termTerms(req, tier, kind, b, null);
      if (t.error) return fail(res, 400, t.error);
      const term = await inTransaction(async (client) => {
        if (newContact) {
          const ins = await client.query(
            `INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, phone, mailing_address, kind)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [req.orgId, newContact.display_name, newContact.first_name, newContact.last_name, newContact.email, newContact.phone, newContact.mailing_address, newContact.kind]);
          contactId = ins.rows[0].id;
        }
        return insertTerm(client, req, contactId, tier, t, b.source === 'import' ? 'import' : 'staff', null, b);
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
        const later = terms.find((t) => t.starts_on > prev.ends_on && t.status_override !== 'ended');
        if (later) return fail(res, 409, 'A renewal already exists for this dues member. Open it to record payment.');
        const asOf = day(b.on) || M.today();
        if (!S.renewalOpen(prev.ends_on, asOf, settings) && !b.starts_on) {
          return fail(res, 400, 'Renewals open ' + settings.renewal_window_days + ' days before the next term starts (' + S.addDays(prev.ends_on, 1) + ').');
        }
      }
      const t = await termTerms(req, tier, c.rows[0].kind, b, prev);
      if (t.error) return fail(res, 400, t.error);
      const overlap = terms.find((x) => x.status_override !== 'ended' && x.starts_on <= t.dates.ends_on && x.ends_on >= t.dates.starts_on);
      if (overlap) return fail(res, 409, 'These dates overlap the term from ' + overlap.starts_on + ' to ' + overlap.ends_on + '. Change the dates or extend that term.');
      const term = await inTransaction((client) => insertTerm(client, req, contactId, tier, t, prev ? 'renewal' : 'staff', prev ? prev.id : null, b));
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
      const ins = await pool.query(
        `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, reason, refund_of_id, payment_date,
                                              recorded_by_user_id, posting_status)
         VALUES ($1, $2, $3, 'refund', $4, $5, $6, $7, $8, $9, 'unposted') RETURNING id`,
        [req.orgId, p.term_id, p.constituent_id, method, value, reason, p.id, day(b.payment_date) || M.today(), userIdOf(req)]);
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
