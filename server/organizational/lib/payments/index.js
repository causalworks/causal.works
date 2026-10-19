'use strict';

// Payment provider interface. Each provider offers the same functions:
//   createCheckout({ secret, kind: 'payment'|'subscription', interval, amountCents, currency, description, customerEmail,
//                    customerRef, successUrl, cancelUrl, metadata }) -> { id, url }
//   createPortal({ secret, customerRef, returnUrl }) -> { url }
//   refund({ secret, paymentRef, amountCents }) -> { id }
//   verifyWebhook({ payload, headers, secret, now }) -> provider event, or throws when the signature does not match
//   normalize(event) -> { id, kind, termId, orgId, amountCents, paymentRef, subscriptionRef, customerRef, billingReason,
//                         periodStart, plan, refunds } with kind one of payment_succeeded, payment_failed,
//                         subscription_started, subscription_cancelled, refunded, ignored

const stripe = require('./stripeProvider');

const PROVIDERS = { stripe };

function getProvider(name) {
  const p = PROVIDERS[name];
  if (!p) throw new Error('Unknown payment provider: ' + name);
  return p;
}

module.exports = { getProvider, PROVIDERS };
