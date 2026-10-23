'use strict';

// Online dues payments: the workspace's payment provider account (credentials stored encrypted), hosted checkout and
// card-update pages, refunds through the provider, and the handlers for confirmed provider events. Every handler is
// safe to run twice: payments are keyed on the provider's reference, and a failed payment never creates or extends a term.

const { encryptCredential, decryptCredential } = require('./podCredentialCrypto');
const { getProvider } = require('./payments');
const { logAudit } = require('./auditLog');
const { NS, withLock } = require('./advisoryLock');
const M = require('./membership');
const S = require('./membershipStatus');

// --- Provider account ---

async function loadAccounts(pool, orgId, provider) {
  const r = await pool.query('SELECT * FROM org_payment_accounts WHERE org_id = $1 AND provider = $2 ORDER BY mode', [orgId, provider || 'stripe']);
  return r.rows;
}

function reveal(row, field) {
  if (!row || !row[field + '_enc']) return null;
  return decryptCredential({ encrypted: row[field + '_enc'], iv: row[field + '_iv'], authTag: row[field + '_tag'] });
}

function publicAccount(row) {
  return { mode: row.mode, account_ref: row.account_ref, has_secret: !!row.secret_enc, has_webhook_secret: !!row.webhook_secret_enc, updated_at: row.updated_at };
}

async function saveAccount(pool, { orgId, userId, provider, mode, accountRef, secret, webhookSecret }) {
  const enc = secret ? encryptCredential(secret) : null;
  const wenc = webhookSecret ? encryptCredential(webhookSecret) : null;
  await pool.query(
    `INSERT INTO org_payment_accounts (org_id, provider, mode, account_ref, secret_enc, secret_iv, secret_tag, webhook_secret_enc, webhook_secret_iv, webhook_secret_tag, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (org_id, provider, mode) DO UPDATE SET
       account_ref = COALESCE(EXCLUDED.account_ref, org_payment_accounts.account_ref),
       secret_enc = COALESCE(EXCLUDED.secret_enc, org_payment_accounts.secret_enc),
       secret_iv = COALESCE(EXCLUDED.secret_iv, org_payment_accounts.secret_iv),
       secret_tag = COALESCE(EXCLUDED.secret_tag, org_payment_accounts.secret_tag),
       webhook_secret_enc = COALESCE(EXCLUDED.webhook_secret_enc, org_payment_accounts.webhook_secret_enc),
       webhook_secret_iv = COALESCE(EXCLUDED.webhook_secret_iv, org_payment_accounts.webhook_secret_iv),
       webhook_secret_tag = COALESCE(EXCLUDED.webhook_secret_tag, org_payment_accounts.webhook_secret_tag),
       updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [orgId, provider || 'stripe', mode, accountRef || null, enc && enc.encrypted, enc && enc.iv, enc && enc.authTag,
     wenc && wenc.encrypted, wenc && wenc.iv, wenc && wenc.authTag, userId || null]);
}

// The account card payments use now (the workspace's test or live mode), or null when card payments are off.
async function activeAccount(pool, orgId, settings) {
  const s = settings || await M.getSettings(pool, orgId);
  if (!s.card_payments_enabled) return null;
  const row = (await loadAccounts(pool, orgId, 'stripe')).find((a) => a.mode === (s.payment_mode || 'test'));
  if (!row || !row.secret_enc) return null;
  return { row, secret: reveal(row, 'secret') };
}

// --- Checkout and card update ---

function instalmentCents(priceCents) {
  return Math.ceil(Number(priceCents) / 12);
}

async function startCheckout(pool, { orgId, workspaceName, term, contact, plan, successUrl, cancelUrl, provider }) {
  const settings = await M.getSettings(pool, orgId);
  const acct = await activeAccount(pool, orgId, settings);
  if (!acct) return { error: 'Card payments are not set up for this workspace. Pay by check or ask for an invoice.' };
  const p = provider || getProvider(acct.row.provider);
  const tierName = term.tier_name || 'membership';
  let o;
  if (plan === 'monthly') {
    if (!settings.monthly_instalments_enabled) return { error: 'Monthly payments are not offered. Choose to pay once or every year.' };
    o = { kind: 'subscription', interval: 'month', amountCents: instalmentCents(term.price_cents), description: workspaceName + ' membership: ' + tierName + ' (monthly)' };
  } else if (plan === 'yearly') {
    o = { kind: 'subscription', interval: 'year', amountCents: Number(term.price_cents), description: workspaceName + ' membership: ' + tierName + ' (renews every year)' };
  } else {
    const due = Math.max(0, Number(term.price_cents) - Number(term.covered_cents || 0));
    if (!due) return { error: 'Nothing is owed on this membership.' };
    o = { kind: 'payment', amountCents: due, description: workspaceName + ' membership: ' + tierName };
  }
  if (!(o.amountCents > 0)) return { error: 'Nothing is owed on this membership.' };
  const session = await p.createCheckout({
    ...o, secret: acct.secret, currency: 'usd', customerEmail: contact.email || undefined, customerRef: term.processor_customer_ref || undefined,
    successUrl, cancelUrl, metadata: { org_id: String(orgId), term_id: String(term.id), plan: plan || 'once' },
  });
  return { url: session.url };
}

async function cardPortal(pool, { orgId, customerRef, returnUrl, provider }) {
  const acct = await activeAccount(pool, orgId);
  if (!acct || !customerRef) return { error: 'There is no saved card to update.' };
  const p = provider || getProvider(acct.row.provider);
  return { url: (await p.createPortal({ secret: acct.secret, customerRef, returnUrl })).url };
}

async function refundThroughProvider(pool, { orgId, paymentRef, amountCents, provider }) {
  const acct = await activeAccount(pool, orgId);
  if (!acct) return { error: 'Card payments are not set up, so this card payment cannot be refunded from here. Refund it in the payment provider.' };
  const p = provider || getProvider(acct.row.provider);
  return { id: (await p.refund({ secret: acct.secret, paymentRef, amountCents })).id };
}

// --- Provider events ---

async function termById(pool, orgId, id) {
  if (!id) return null;
  return (await pool.query('SELECT * FROM org_membership_terms WHERE id = $1 AND org_id = $2', [id, orgId])).rows[0] || null;
}

async function subscriptionTerms(pool, orgId, subscriptionRef) {
  if (!subscriptionRef) return [];
  return (await pool.query(
    `SELECT * FROM org_membership_terms WHERE org_id = $1 AND processor_subscription_ref = $2 AND status_override IS NULL ORDER BY starts_on DESC, id DESC`,
    [orgId, subscriptionRef])).rows;
}

async function renewFrom(client, orgId, base) {
  const tier = (await client.query('SELECT * FROM org_membership_tiers WHERE id = $1 AND org_id = $2', [base.tier_id, orgId])).rows[0];
  if (!tier) return { error: 'tier not found' };
  const kind = (await client.query('SELECT kind FROM org_constituents WHERE id = $1', [base.constituent_id])).rows[0].kind;
  const plan = await M.planTerm(client, orgId, { ...tier, archived_at: null }, kind,
    { price_cents: tier.pay_what_you_can ? base.price_cents : undefined, eligibility_confirmed: true, on: S.addDays(S.toDay(base.ends_on), 1) }, base);
  if (plan.error) return { error: plan.error };
  const term = await M.insertTerm(client, { orgId, userId: null, contactId: base.constituent_id, tier, plan, source: 'renewal', renewsTermId: base.id, autoRenew: true });
  await client.query(
    `UPDATE org_membership_terms SET processor_subscription_ref = $1, processor_customer_ref = $2, instalment_plan = $3 WHERE id = $4`,
    [base.processor_subscription_ref, base.processor_customer_ref, base.instalment_plan, term.id]);
  return { term };
}

async function paymentSucceeded(pool, orgId, ev) {
  if (!ev.paymentRef || !(Number(ev.amountCents) > 0)) return 'ignored: no amount';
  const dup = await pool.query('SELECT 1 FROM org_membership_payments WHERE processor_ref = $1', [ev.paymentRef]);
  if (dup.rows.length) return 'duplicate payment';
  const subTerms = await subscriptionTerms(pool, orgId, ev.subscriptionRef);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let term = null;
    let created = null;
    if (ev.subscriptionRef && subTerms.length && ev.billingReason !== 'subscription_create') {
      const ps = ev.periodStart || M.today();
      term = subTerms.find((t) => S.toDay(t.starts_on) <= ps && S.toDay(t.ends_on) >= ps) || null;
      const base = subTerms[0];
      if (!term && ps > S.toDay(base.ends_on)) {
        const r = await renewFrom(client, orgId, base);
        if (r.error) { await client.query('ROLLBACK'); return 'not applied: ' + r.error; }
        term = r.term;
        created = term;
      }
    }
    if (!term) term = await termById(client, orgId, ev.termId);
    if (!term) { await client.query('ROLLBACK'); return 'not applied: term not found'; }
    const ins = await client.query(
      `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, processor_ref, payment_date, notes, posting_status)
       VALUES ($1, $2, $3, 'payment', 'card', $4, $5, CURRENT_DATE, 'Paid by card online', 'unposted')
       ON CONFLICT (processor_ref) WHERE processor_ref IS NOT NULL DO NOTHING RETURNING id`,
      [orgId, term.id, term.constituent_id, ev.amountCents, ev.paymentRef]);
    if (!ins.rows.length) { await client.query('ROLLBACK'); return 'duplicate payment'; }
    await client.query(
      `UPDATE org_membership_terms SET payment_failed_at = NULL, processor_customer_ref = COALESCE(processor_customer_ref, $1),
              processor_subscription_ref = COALESCE(processor_subscription_ref, $2), updated_at = now() WHERE id = $3`,
      [ev.customerRef || null, ev.subscriptionRef || null, term.id]);
    await client.query('COMMIT');
    if (created) await logAudit(pool, { orgId, userId: null, action: 'create', tableName: 'org_membership_terms', recordId: created.id, metadata: { via: 'payment provider', renews: created.renews_term_id } });
    await logAudit(pool, { orgId, userId: null, action: 'create', tableName: 'org_membership_payments', recordId: ins.rows[0].id, metadata: { via: 'payment provider', kind: 'payment', term: term.id, amount_cents: ev.amountCents } });
    return 'payment recorded on term ' + term.id + (created ? ' (new renewal term)' : '');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function paymentFailed(pool, orgId, ev) {
  const term = (await subscriptionTerms(pool, orgId, ev.subscriptionRef))[0] || await termById(pool, orgId, ev.termId);
  if (!term) return 'not applied: term not found';
  const r = await pool.query('UPDATE org_membership_terms SET payment_failed_at = COALESCE(payment_failed_at, now()), updated_at = now() WHERE id = $1 RETURNING payment_failed_at', [term.id]);
  await logAudit(pool, { orgId, userId: null, action: 'update', tableName: 'org_membership_terms', recordId: term.id, fields: [{ fieldName: 'payment_failed', oldValue: null, newValue: String(r.rows[0].payment_failed_at) }], metadata: { via: 'payment provider' } });
  return 'failure noted on term ' + term.id;
}

async function subscriptionStarted(pool, orgId, ev) {
  const term = await termById(pool, orgId, ev.termId);
  if (!term) return 'not applied: term not found';
  await pool.query(
    `UPDATE org_membership_terms SET processor_subscription_ref = $1, processor_customer_ref = COALESCE($2, processor_customer_ref), auto_renew = true,
            instalment_plan = $3, updated_at = now() WHERE id = $4`,
    [ev.subscriptionRef, ev.customerRef || null, ev.plan === 'monthly' ? 'monthly' : null, term.id]);
  await logAudit(pool, { orgId, userId: null, action: 'update', tableName: 'org_membership_terms', recordId: term.id, fields: [{ fieldName: 'auto_renew', oldValue: String(term.auto_renew), newValue: 'true' }], metadata: { via: 'payment provider', plan: ev.plan || 'yearly' } });
  return 'subscription linked to term ' + term.id;
}

async function subscriptionCancelled(pool, orgId, ev) {
  const r = await pool.query(
    `UPDATE org_membership_terms SET auto_renew = false, updated_at = now() WHERE org_id = $1 AND processor_subscription_ref = $2 AND auto_renew RETURNING id`,
    [orgId, ev.subscriptionRef]);
  for (const t of r.rows) await logAudit(pool, { orgId, userId: null, action: 'update', tableName: 'org_membership_terms', recordId: t.id, fields: [{ fieldName: 'auto_renew', oldValue: 'true', newValue: 'false' }], metadata: { via: 'payment provider' } });
  return 'automatic renewal ended on ' + r.rows.length + ' term(s)';
}

async function refunded(pool, orgId, ev) {
  const orig = (await pool.query(`SELECT * FROM org_membership_payments WHERE org_id = $1 AND processor_ref = $2 AND kind = 'payment'`, [orgId, ev.paymentRef])).rows[0];
  if (!orig) return 'not applied: payment not found';
  return withLock(pool, NS.duesPayment, orig.id, () => recordRefunds(pool, orgId, ev, orig), null).then((out) => {
    if (out === null) throw new Error('refund for payment ' + orig.id + ' is busy; try again');
    return out;
  });
}

async function recordRefunds(pool, orgId, ev, orig) {
  let n = 0;
  for (const rf of ev.refunds || []) {
    const left = Number(orig.amount_cents) - Number((await pool.query(`SELECT COALESCE(SUM(amount_cents), 0)::int AS s FROM org_membership_payments WHERE refund_of_id = $1 AND posting_status <> 'void'`, [orig.id])).rows[0].s);
    const amount = Math.min(Number(rf.amountCents), left);
    if (!(amount > 0)) continue;
    const ins = await pool.query(
      `INSERT INTO org_membership_payments (org_id, term_id, constituent_id, kind, method, amount_cents, reason, refund_of_id, processor_ref, payment_date, posting_status)
       VALUES ($1, $2, $3, 'refund', 'card', $4, 'Refunded through the payment provider', $5, $6, CURRENT_DATE, 'unposted')
       ON CONFLICT (processor_ref) WHERE processor_ref IS NOT NULL DO NOTHING RETURNING id`,
      [orgId, orig.term_id, orig.constituent_id, amount, orig.id, rf.id]);
    if (ins.rows.length) {
      n += 1;
      await logAudit(pool, { orgId, userId: null, action: 'create', tableName: 'org_membership_payments', recordId: ins.rows[0].id, metadata: { via: 'payment provider', kind: 'refund', refund_of: orig.id, reason: 'Refunded through the payment provider' } });
    }
  }
  return n + ' refund(s) recorded';
}

async function handleEvent(pool, orgId, ev) {
  if (ev.orgId && Number(ev.orgId) !== Number(orgId)) return 'ignored: event belongs to another workspace';
  switch (ev.kind) {
    case 'payment_succeeded': return paymentSucceeded(pool, orgId, ev);
    case 'payment_failed': return paymentFailed(pool, orgId, ev);
    case 'subscription_started': return subscriptionStarted(pool, orgId, ev);
    case 'subscription_cancelled': return subscriptionCancelled(pool, orgId, ev);
    case 'refunded': return refunded(pool, orgId, ev);
    default: return 'ignored';
  }
}

module.exports = {
  loadAccounts, reveal, publicAccount, saveAccount, activeAccount, instalmentCents,
  startCheckout, cardPortal, refundThroughProvider, handleEvent,
};
