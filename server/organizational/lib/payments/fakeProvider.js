'use strict';

// Fake payment provider for tests: records calls, returns predictable ids and pages, and takes events already in the
// normalized shape. Signatures use the same scheme as the real provider.

const { verify } = require('./signature');

const calls = [];
let seq = 0;

function next(prefix) { seq += 1; return prefix + '_' + seq; }

module.exports = {
  name: 'fake',
  calls,
  reset() { calls.length = 0; },
  async createCheckout(o) {
    const id = next('cs');
    calls.push({ fn: 'createCheckout', ...o, secret: undefined });
    return { id, url: 'https://checkout.example.test/' + id };
  },
  async createPortal(o) {
    calls.push({ fn: 'createPortal', customerRef: o.customerRef });
    return { url: 'https://portal.example.test/' + o.customerRef };
  },
  async refund(o) {
    calls.push({ fn: 'refund', paymentRef: o.paymentRef, amountCents: o.amountCents });
    return { id: next('re') };
  },
  verifyWebhook({ payload, headers, secret, now }) {
    verify(payload, headers['x-signature'] || headers['stripe-signature'], secret, now);
    return JSON.parse(Buffer.isBuffer(payload) ? payload.toString('utf8') : payload);
  },
  normalize(event) {
    return { refunds: [], ...event };
  },
};
