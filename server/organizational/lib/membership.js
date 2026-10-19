'use strict';

// Membership data helpers shared by lists, exports, renewals, the summary and the record page:
// settings, tier prices, terms with their payments, and each dues member's derived status.

const S = require('./membershipStatus');
const { hasRoleCondition, addContactRoles } = require('./contactRoles');

const SETTINGS_FIELDS = [
  'year_mode', 'fixed_start_month', 'fixed_start_day', 'renewal_window_days', 'proration_mode', 'grace_days',
  'join_requires_approval', 'recognition_mode', 'deferred_dues_account_id', 'contribution_account_id',
  'dues_revenue_account_id', 'default_program_id', 'directory_fields', 'join_form_enabled', 'form_fields',
  'extra_gift_enabled', 'auto_renew_default', 'payment_mode', 'card_payments_enabled', 'monthly_instalments_enabled',
  'directory_enabled',
];

const SETTINGS_DEFAULTS = {
  ...S.DEFAULT_SETTINGS,
  join_requires_approval: false, recognition_mode: 'spread', deferred_dues_account_id: null,
  contribution_account_id: null, dues_revenue_account_id: null, default_program_id: null,
  directory_fields: [], join_form_enabled: false, form_fields: [], extra_gift_enabled: false,
  auto_renew_default: false, payment_mode: 'test', card_payments_enabled: false, monthly_instalments_enabled: false,
  directory_enabled: false,
};

function today() {
  return S.toDay(new Date());
}

async function getSettings(pool, orgId) {
  const r = await pool.query('SELECT * FROM org_membership_settings WHERE org_id = $1', [orgId]);
  const row = r.rows[0];
  const out = { ...SETTINGS_DEFAULTS };
  if (row) for (const k of SETTINGS_FIELDS) if (row[k] !== undefined && row[k] !== null) out[k] = row[k];
  out.saved = !!row;
  return out;
}

// --- Tiers and prices ---

async function tierPriceOn(pool, tierId, day) {
  const r = await pool.query(
    `SELECT price_cents FROM org_membership_tier_prices WHERE tier_id = $1
      ORDER BY (effective_on <= $2::date) DESC, CASE WHEN effective_on <= $2::date THEN effective_on END DESC NULLS LAST, effective_on ASC
      LIMIT 1`,
    [tierId, day]);
  return r.rows.length ? Number(r.rows[0].price_cents) : null;
}

async function listTiers(pool, orgId, opts) {
  const day = (opts && opts.day) || today();
  const r = await pool.query(
    `SELECT t.*,
            (SELECT p.price_cents FROM org_membership_tier_prices p WHERE p.tier_id = t.id AND p.effective_on <= $2::date
              ORDER BY p.effective_on DESC LIMIT 1) AS price_cents,
            COALESCE((SELECT json_agg(json_build_object('effective_on', p.effective_on, 'price_cents', p.price_cents) ORDER BY p.effective_on)
                        FROM org_membership_tier_prices p WHERE p.tier_id = t.id), '[]') AS prices
       FROM org_membership_tiers t
      WHERE t.org_id = $1 ${opts && opts.includeArchived ? '' : 'AND t.archived_at IS NULL'}
      ORDER BY t.display_order, t.name`,
    [orgId, day]);
  return r.rows.map((t) => {
    let price = t.price_cents;
    if (price == null && Array.isArray(t.prices) && t.prices.length) price = t.prices[0].price_cents;
    return { ...t, price_cents: price == null ? null : Number(price) };
  });
}

// Suggested tier for an organization by the annual budget it states.
function tierForBudget(tiers, budgetCents) {
  const b = Number(budgetCents);
  if (!Number.isFinite(b)) return null;
  return tiers.find((t) => t.applies_to !== 'individual' && (t.budget_low_cents != null || t.budget_high_cents != null)
    && (t.budget_low_cents == null || b >= Number(t.budget_low_cents))
    && (t.budget_high_cents == null || b <= Number(t.budget_high_cents))) || null;
}

// --- Terms ---

async function loadTerms(pool, orgId, contactIds) {
  const params = [orgId];
  let where = 't.org_id = $1';
  if (contactIds) { params.push(contactIds); where += ' AND t.constituent_id = ANY($2::int[])'; }
  const terms = await pool.query(
    `SELECT t.*, tr.name AS tier_name FROM org_membership_terms t
       LEFT JOIN org_membership_tiers tr ON tr.id = t.tier_id
      WHERE ${where} ORDER BY t.starts_on DESC, t.id DESC`, params);
  const pays = await pool.query(
    `SELECT p.id, p.term_id, p.kind, p.amount_cents, p.discount_cents, p.posting_status, p.approved_at
       FROM org_membership_payments p JOIN org_membership_terms t ON t.id = p.term_id
      WHERE ${where}`, params);
  const inv = await pool.query(
    `SELECT t.id AS term_id, ip.amount_cents FROM org_invoice_payments ip
       JOIN org_membership_terms t ON t.invoice_id = ip.invoice_id
      WHERE ${where} AND ip.status = 'posted'`, params);
  for (const r of inv.rows) pays.rows.push({ id: null, term_id: r.term_id, kind: 'payment', amount_cents: Number(r.amount_cents), discount_cents: 0, posting_status: 'posted', via_invoice: true });
  const byTerm = new Map();
  for (const p of pays.rows) {
    if (!byTerm.has(p.term_id)) byTerm.set(p.term_id, []);
    byTerm.get(p.term_id).push(p);
  }
  return terms.rows.map((t) => {
    const payments = byTerm.get(t.id) || [];
    return {
      ...t,
      starts_on: S.toDay(t.starts_on), ends_on: S.toDay(t.ends_on), ended_on: S.toDay(t.ended_on),
      price_cents: Number(t.price_cents), contribution_cents: Number(t.contribution_cents),
      payments, covered_cents: S.coveredCents(payments),
    };
  });
}

function decorateTerm(t, day, settings) {
  return { ...t, state: S.termState(t, day, settings), settled: S.isSettled(t, day), balance_cents: Math.max(0, t.price_cents - t.covered_cents) };
}

// Status for every dues member, keyed by contact id.
async function statusByContact(pool, orgId, opts) {
  const day = (opts && opts.today) || today();
  const settings = (opts && opts.settings) || await getSettings(pool, orgId);
  const terms = await loadTerms(pool, orgId, opts && opts.contactIds);
  const grouped = new Map();
  for (const t of terms) {
    if (!grouped.has(t.constituent_id)) grouped.set(t.constituent_id, []);
    grouped.get(t.constituent_id).push(t);
  }
  const out = new Map();
  for (const [cid, list] of grouped) {
    const s = S.memberStatus(list, day, settings);
    const next = s ? list.filter((t) => t.starts_on > s.term.ends_on && t.status_override !== 'ended').pop() : null;
    out.set(cid, {
      status: s ? s.status : null,
      term: s ? decorateTerm(s.term, day, settings) : null,
      next_term: next ? decorateTerm(next, day, settings) : null,
      terms: list.map((t) => decorateTerm(t, day, settings)),
    });
  }
  return out;
}

// --- Dues members (a filtered contact view) ---

function parseListFilters(q) {
  const f = {};
  if (q.q) f.q = String(q.q).trim();
  if (q.kind && ['individual', 'organization'].includes(String(q.kind))) f.kind = String(q.kind);
  if (q.tags) f.tags = String(q.tags).split(',').map((t) => t.trim()).filter(Boolean);
  if (q.active) f.active = String(q.active).toLowerCase();
  if (q.status && S.STATUSES.includes(String(q.status))) f.status = String(q.status);
  if (q.tier_id && /^\d+$/.test(String(q.tier_id))) f.tierId = Number(q.tier_id);
  return f;
}

async function listDuesMembers(pool, orgId, filters, opts) {
  const f = filters || {};
  const conditions = ['c.org_id = $1', hasRoleCondition('dues_member')];
  const params = [orgId];
  if (f.active !== 'all') { params.push(f.active !== 'false'); conditions.push(`c.is_active = $${params.length}`); }
  if (f.kind) { params.push(f.kind); conditions.push(`c.kind = $${params.length}`); }
  if (f.q) {
    params.push(`%${f.q}%`);
    conditions.push(`(c.display_name ILIKE $${params.length} OR c.email ILIKE $${params.length} OR array_to_string(c.additional_emails, ' ') ILIKE $${params.length})`);
  }
  if (f.tags && f.tags.length) { params.push(f.tags); conditions.push(`c.tags && $${params.length}`); }
  if (f.ids) { params.push(f.ids); conditions.push(`c.id = ANY($${params.length}::int[])`); }
  const r = await pool.query(
    `SELECT c.id, c.display_name, c.first_name, c.last_name, c.kind, c.org_type, c.email, c.additional_emails, c.phone,
            c.mailing_address, c.tags, c.is_active,
            GREATEST((SELECT max(m.sent_at)::date FROM org_membership_messages m WHERE m.constituent_id = c.id AND m.status = 'sent'),
                     (SELECT max(i.interaction_date) FROM org_constituent_interactions i WHERE i.constituent_id = c.id)) AS last_contact_on
       FROM org_constituents c WHERE ${conditions.join(' AND ')} ORDER BY c.display_name`, params);
  const statuses = await statusByContact(pool, orgId, { ...(opts || {}), contactIds: r.rows.map((x) => x.id) });
  let rows = r.rows.map((c) => {
    const s = statuses.get(c.id) || { status: null, term: null };
    return {
      ...c, last_contact_on: S.toDay(c.last_contact_on),
      status: s.status,
      term: s.term ? {
        id: s.term.id, tier_id: s.term.tier_id, tier_name: s.term.tier_name, starts_on: s.term.starts_on, ends_on: s.term.ends_on,
        price_cents: s.term.price_cents, covered_cents: s.term.covered_cents, balance_cents: s.term.balance_cents, state: s.term.state,
      } : null,
      renewal: s.next_term ? { term_id: s.next_term.id, starts_on: s.next_term.starts_on, settled: s.next_term.settled } : null,
    };
  });
  if (f.status) rows = rows.filter((x) => x.status === f.status);
  if (f.tierId) rows = rows.filter((x) => x.term && x.term.tier_id === f.tierId);
  return rows;
}

// Dues members whose current term ends within `days`, plus those in grace.
function renewalsFrom(rows, opts) {
  const day = (opts && opts.today) || today();
  const days = opts && opts.days != null ? Number(opts.days) : 60;
  const noContactDays = opts && opts.noContactDays != null ? Number(opts.noContactDays) : null;
  return rows
    .filter((x) => x.term && ['active', 'grace'].includes(x.status) && !(x.renewal && x.renewal.settled))
    .map((x) => ({ ...x, days_to_expiry: S.dayDiff(x.term.ends_on, day) }))
    .filter((x) => x.status === 'grace' || x.days_to_expiry <= days)
    .filter((x) => noContactDays == null || !x.last_contact_on || S.dayDiff(day, x.last_contact_on) >= noContactDays)
    .sort((a, b) => a.days_to_expiry - b.days_to_expiry);
}

// --- Input parsing ---

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

// --- New terms ---

// Dates, price and contribution part for a new term on a tier, or { error }.
async function planTerm(pool, orgId, tier, contactKind, b, baseTerm) {
  if (tier.archived_at) return { error: 'That tier is archived. Pick a current tier.' };
  if (tier.applies_to === 'individual' && contactKind === 'organization') return { error: 'That tier is for individuals. Pick a tier for organizations.' };
  if (tier.applies_to === 'organization' && contactKind === 'individual') return { error: 'That tier is for organizations. Pick a tier for individuals.' };
  if (tier.eligibility_required && b.eligibility_confirmed !== true) return { error: 'Tick the eligibility statement to confirm it applies.' };
  const settings = await getSettings(pool, orgId);
  const asOf = day(b.on) || today();
  let dates;
  const startGiven = day(b.starts_on);
  if (baseTerm) dates = S.renewalTermDates(S.toDay(baseTerm.ends_on), asOf, settings);
  else dates = S.joinTermDates(startGiven || asOf, settings);
  if (startGiven && baseTerm) dates = { ...dates, starts_on: startGiven, ends_on: day(b.ends_on) || S.addDays(S.addMonths(startGiven, 12), -1), year_start: startGiven };
  if (day(b.ends_on)) dates.ends_on = day(b.ends_on);
  if (dates.ends_on < dates.starts_on) return { error: 'The end date must be on or after the start date.' };
  const listPrice = await tierPriceOn(pool, tier.id, dates.starts_on);
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
  const benefit = tier.benefit_value_cents != null ? Number(tier.benefit_value_cents)
    : (tier.pay_what_you_can ? Number(tier.suggested_price_cents ?? tier.min_price_cents ?? price) : price);
  return { dates, price, contribution: Math.max(0, price - benefit), settings };
}

async function insertTerm(client, { orgId, userId, contactId, tier, plan, source, renewsTermId, autoRenew }) {
  const r = await client.query(
    `INSERT INTO org_membership_terms (org_id, constituent_id, tier_id, starts_on, ends_on, price_cents, contribution_cents, source,
                                       auto_renew, renews_term_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [orgId, contactId, tier.id, plan.dates.starts_on, plan.dates.ends_on, plan.price, plan.contribution, source,
     autoRenew !== undefined ? !!autoRenew : !!plan.settings.auto_renew_default, renewsTermId || null, userId || null]);
  await addContactRoles(client, orgId, contactId, ['dues_member']);
  return r.rows[0];
}

module.exports = {
  cents, day, text, planTerm, insertTerm,
  SETTINGS_FIELDS, SETTINGS_DEFAULTS, today, getSettings, tierPriceOn, listTiers, tierForBudget,
  loadTerms, decorateTerm, statusByContact, parseListFilters, listDuesMembers, renewalsFrom,
};
