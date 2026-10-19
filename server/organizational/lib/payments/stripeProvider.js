'use strict';

// Stripe implementation of the payment provider interface, over Stripe's HTTPS API (form-encoded requests).
// Card details are entered on Stripe's hosted pages only; this server never sees them.

const { verify } = require('./signature');

const API = 'https://api.stripe.com/v1';

function form(obj, prefix, out) {
  const o = out || new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? prefix + '[' + k + ']' : k;
    if (typeof v === 'object') form(v, key, o);
    else o.append(key, String(v));
  }
  return o;
}

async function call(secret, method, path, body, fetchImpl) {
  const res = await (fetchImpl || fetch)(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + secret, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body ? form(body).toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data.error && data.error.message) || 'The payment provider refused the request.');
    err.providerStatus = res.status;
    throw err;
  }
  return data;
}

function metadataOf(obj) {
  return (obj && obj.metadata) || {};
}

module.exports = {
  name: 'stripe',

  async createCheckout(o) {
    const item = { price_data: { currency: o.currency || 'usd', unit_amount: o.amountCents, product_data: { name: o.description } }, quantity: 1 };
    if (o.kind === 'subscription') item.price_data.recurring = { interval: o.interval || 'year' };
    const body = {
      mode: o.kind === 'subscription' ? 'subscription' : 'payment',
      line_items: [item],
      success_url: o.successUrl,
      cancel_url: o.cancelUrl,
      metadata: o.metadata,
      ...(o.customerRef ? { customer: o.customerRef } : { customer_email: o.customerEmail }),
      ...(o.kind === 'subscription' ? { subscription_data: { metadata: o.metadata } } : { payment_intent_data: { metadata: o.metadata } }),
    };
    const s = await call(o.secret, 'POST', '/checkout/sessions', body, o.fetch);
    return { id: s.id, url: s.url };
  },

  async createPortal(o) {
    const s = await call(o.secret, 'POST', '/billing_portal/sessions', { customer: o.customerRef, return_url: o.returnUrl }, o.fetch);
    return { url: s.url };
  },

  async refund(o) {
    const r = await call(o.secret, 'POST', '/refunds', { payment_intent: o.paymentRef, amount: o.amountCents }, o.fetch);
    return { id: r.id };
  },

  verifyWebhook({ payload, headers, secret, now }) {
    verify(payload, headers['stripe-signature'], secret, now);
    return JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : payload);
  },

  normalize(event) {
    const o = (event.data && event.data.object) || {};
    const base = { id: event.id, livemode: !!event.livemode, refunds: [] };
    const md = metadataOf(o);
    const fromMd = (m) => ({ termId: m.term_id ? Number(m.term_id) : null, orgId: m.org_id ? Number(m.org_id) : null, plan: m.plan || null });
    switch (event.type) {
      case 'checkout.session.completed':
        if (o.mode === 'subscription') {
          return { ...base, kind: 'subscription_started', ...fromMd(md), subscriptionRef: o.subscription, customerRef: o.customer };
        }
        if (o.payment_status !== 'paid') return { ...base, kind: 'ignored' };
        return { ...base, kind: 'payment_succeeded', ...fromMd(md), amountCents: o.amount_total, paymentRef: o.payment_intent || o.id, customerRef: o.customer };
      case 'invoice.paid': {
        if (!o.subscription) return { ...base, kind: 'ignored' };
        const smd = (o.subscription_details && o.subscription_details.metadata) || (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata) || {};
        const line = o.lines && o.lines.data && o.lines.data[0];
        return {
          ...base, kind: 'payment_succeeded', ...fromMd(smd), amountCents: o.amount_paid, paymentRef: o.payment_intent || o.id,
          subscriptionRef: o.subscription, customerRef: o.customer, billingReason: o.billing_reason,
          periodStart: line && line.period ? new Date(line.period.start * 1000).toISOString().slice(0, 10) : null,
        };
      }
      case 'invoice.payment_failed': {
        const smd = (o.subscription_details && o.subscription_details.metadata) || {};
        return { ...base, kind: 'payment_failed', ...fromMd(smd), subscriptionRef: o.subscription, customerRef: o.customer };
      }
      case 'payment_intent.payment_failed':
        return { ...base, kind: 'payment_failed', ...fromMd(md), paymentRef: o.id };
      case 'customer.subscription.deleted':
        return { ...base, kind: 'subscription_cancelled', ...fromMd(md), subscriptionRef: o.id };
      case 'charge.refunded':
        return {
          ...base, kind: 'refunded', paymentRef: o.payment_intent,
          refunds: ((o.refunds && o.refunds.data) || []).map((r) => ({ id: r.id, amountCents: r.amount })),
        };
      default:
        return { ...base, kind: 'ignored' };
    }
  },
};
