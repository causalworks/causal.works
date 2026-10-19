'use strict';

// Joining from the public form: matching the confirmed email to a contact, creating the term and the optional
// extra gift, and the self-service account for a signed-in dues member.

const M = require('./membership');
const S = require('./membershipStatus');
const { logAudit } = require('./auditLog');

const FORM_FIELDS = ['phone', 'mailing_address', 'annual_budget'];
const JOIN_CONFIRM = 'membership_join';
const SIGN_IN = 'membership_sign_in';
const SESSION = 'membership_session';
const SESSION_MINUTES = 60;

function paymentNote(workspaceName) {
  return 'Pay by check or ask ' + workspaceName + ' for an invoice. Your membership becomes active when the payment is received.';
}

async function contactForEmail(pool, orgId, email) {
  if (!email) return null;
  const r = await pool.query(
    `SELECT id, kind, display_name, email, phone, mailing_address FROM org_constituents
      WHERE org_id = $1 AND is_active
        AND (lower(email) = lower($2) OR lower($2) = ANY (SELECT lower(x) FROM unnest(COALESCE(additional_emails, '{}')) x))
      ORDER BY (lower(email) = lower($2)) DESC, id LIMIT 1`, [orgId, email]);
  return r.rows[0] || null;
}

async function hasCurrentTerm(pool, orgId, contactId) {
  const r = await pool.query(
    `SELECT 1 FROM org_membership_terms WHERE org_id = $1 AND constituent_id = $2 AND status_override IS NULL AND ends_on >= CURRENT_DATE LIMIT 1`,
    [orgId, contactId]);
  return r.rows.length > 0;
}

// Turns a confirmed (and, where asked, approved) join request into a contact, a term and an optional pending gift.
async function acceptJoin(pool, { orgId, requestId, userId }) {
  const rq = (await pool.query('SELECT * FROM org_membership_join_requests WHERE id = $1 AND org_id = $2', [requestId, orgId])).rows[0];
  if (!rq) return { httpStatus: 404, body: { error: 'That join request was not found.' } };
  if (rq.status === 'accepted' || rq.status === 'declined') return { httpStatus: 409, body: { error: 'This join request has already been decided.' } };
  const tier = (await pool.query('SELECT * FROM org_membership_tiers WHERE id = $1 AND org_id = $2', [rq.tier_id, orgId])).rows[0];
  if (!tier) return { httpStatus: 400, body: { error: 'The tier chosen on this request no longer exists.' } };
  const d = rq.details || {};
  const existing = await contactForEmail(pool, orgId, rq.email);
  if (existing && await hasCurrentTerm(pool, orgId, existing.id)) {
    await pool.query(
      `UPDATE org_membership_join_requests SET status = 'declined', decision_reason = 'Already a dues member', decided_at = now(), decided_by = $1,
              constituent_id = $2, details = '{}'::jsonb WHERE id = $3`, [userId || null, existing.id, rq.id]);
    return { httpStatus: 409, body: { code: 'already_member', error: 'This email already belongs to a current dues member. Sign in to see or renew the membership.' } };
  }
  const kind = existing ? existing.kind : rq.kind;
  const plan = await M.planTerm(pool, orgId, tier, kind, {
    price_cents: tier.pay_what_you_can ? rq.price_cents : undefined, eligibility_confirmed: rq.eligibility_confirmed,
  }, null);
  if (plan.error) return { httpStatus: 400, body: { error: plan.error } };

  const client = await pool.connect();
  let out;
  try {
    await client.query('BEGIN');
    let contactId = existing && existing.id;
    let created = false;
    if (!contactId) {
      const ins = await client.query(
        `INSERT INTO org_constituents (org_id, display_name, first_name, last_name, email, phone, mailing_address, kind)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [orgId, d.display_name, kind === 'individual' ? d.first_name || null : null, kind === 'individual' ? d.last_name || null : null,
         rq.email, d.phone || null, d.mailing_address || null, kind]);
      contactId = ins.rows[0].id;
      created = true;
    } else {
      await client.query(
        `UPDATE org_constituents SET phone = COALESCE(phone, $1), mailing_address = COALESCE(mailing_address, $2) WHERE id = $3`,
        [d.phone || null, d.mailing_address || null, contactId]);
    }
    const term = await M.insertTerm(client, { orgId, userId, contactId, tier, plan, source: 'join_form' });
    let giftId = null;
    if (rq.extra_gift_cents > 0 && plan.settings.extra_gift_enabled) {
      const g = await client.query(
        `INSERT INTO org_gifts (org_id, constituent_id, gift_type, amount_cents, received_at, posting_status, source, review_status, notes, program_id)
         VALUES ($1, $2, 'donation', $3, now(), 'not_applicable', 'funding', 'to_confirm', $4, $5) RETURNING id`,
        [orgId, contactId, rq.extra_gift_cents, 'Extra gift offered on the membership join form; not received yet.', plan.settings.default_program_id || null]);
      giftId = g.rows[0].id;
    }
    await client.query(
      `UPDATE org_membership_join_requests SET status = 'accepted', constituent_id = $1, term_id = $2, gift_id = $3, decided_at = now(),
              decided_by = $4, details = '{}'::jsonb WHERE id = $5`, [contactId, term.id, giftId, userId || null, rq.id]);
    await client.query('COMMIT');
    out = { contactId, created, term, giftId };
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
  if (out.created) await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_constituents', recordId: out.contactId, metadata: { via: 'membership join form', join_request: rq.id } });
  await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_membership_terms', recordId: out.term.id, metadata: { via: 'membership join form', join_request: rq.id, tier: tier.name, price_cents: plan.price } });
  if (out.giftId) await logAudit(pool, { orgId, userId, action: 'create', tableName: 'org_gifts', recordId: out.giftId, metadata: { via: 'membership join form', to_confirm: true } });
  return { httpStatus: 200, body: { constituent_id: out.contactId, term_id: out.term.id, gift_id: out.giftId, starts_on: S.toDay(out.term.starts_on), ends_on: S.toDay(out.term.ends_on), price_cents: plan.price } };
}

// What a signed-in dues member sees about themselves: details, status, terms and receipts. Nothing about anyone else.
async function accountView(pool, orgId, contactId) {
  const c = (await pool.query(
    'SELECT id, kind, display_name, first_name, last_name, email, phone, mailing_address FROM org_constituents WHERE id = $1 AND org_id = $2',
    [contactId, orgId])).rows[0];
  if (!c) return null;
  const st = (await M.statusByContact(pool, orgId, { contactIds: [contactId] })).get(contactId) || { status: null, term: null, terms: [] };
  const pays = await pool.query(
    `SELECT p.payment_date, p.kind, p.method, p.amount_cents FROM org_membership_payments p
      WHERE p.org_id = $1 AND p.constituent_id = $2 AND p.posting_status <> 'void' AND p.kind IN ('payment', 'refund')
      ORDER BY p.payment_date DESC, p.id DESC LIMIT 50`, [orgId, contactId]);
  return {
    contact: { kind: c.kind, display_name: c.display_name, first_name: c.first_name, last_name: c.last_name, email: c.email, phone: c.phone, mailing_address: c.mailing_address },
    status: st.status,
    current_term: st.term ? { tier_name: st.term.tier_name, tier_id: st.term.tier_id, starts_on: st.term.starts_on, ends_on: st.term.ends_on, price_cents: st.term.price_cents, owed_cents: st.term.balance_cents } : null,
    renewal: st.next_term ? { starts_on: st.next_term.starts_on, ends_on: st.next_term.ends_on, price_cents: st.next_term.price_cents, owed_cents: st.next_term.balance_cents } : null,
    receipts: pays.rows.map((p) => ({ date: S.toDay(p.payment_date), kind: p.kind, method: p.method, amount_cents: Number(p.amount_cents) })),
    terms: st.terms.map((t) => ({ tier_name: t.tier_name, starts_on: t.starts_on, ends_on: t.ends_on, state: t.state, auto_renew: !!t.auto_renew, instalments: t.instalment_plan || null })),
    terms_customer_ref: st.terms.some((t) => !!t.processor_customer_ref),
  };
}

// Public view of the tiers a join or renewal form offers.
function publicTier(t) {
  return {
    id: t.id, name: t.name, description: t.description, applies_to: t.applies_to, price_cents: t.price_cents,
    pay_what_you_can: !!t.pay_what_you_can, min_price_cents: t.min_price_cents, suggested_price_cents: t.suggested_price_cents,
    budget_low_cents: t.budget_low_cents, budget_high_cents: t.budget_high_cents, seats_included: t.seats_included,
    benefits: t.benefits || [], eligibility_statement: t.eligibility_statement, eligibility_required: !!t.eligibility_required,
  };
}

module.exports = {
  FORM_FIELDS, JOIN_CONFIRM, SIGN_IN, SESSION, SESSION_MINUTES,
  paymentNote, contactForEmail, hasCurrentTerm, acceptJoin, accountView, publicTier,
};
