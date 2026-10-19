'use strict';

// Webhook signatures in the "t=<seconds>,v1=<hex hmac>" form: HMAC-SHA256 of "<t>.<raw body>" with the endpoint secret.

const crypto = require('crypto');

const TOLERANCE_SECONDS = 300;

function sign(payload, secret, t) {
  return crypto.createHmac('sha256', secret).update(t + '.' + payload).digest('hex');
}

function signatureHeader(payload, secret, t) {
  const ts = t || Math.floor(Date.now() / 1000);
  return 't=' + ts + ',v1=' + sign(payload, secret, ts);
}

function verify(payload, header, secret, now) {
  if (!header || !secret) throw new Error('signature missing');
  const parts = String(header).split(',').map((p) => p.trim().split('='));
  const t = (parts.find((p) => p[0] === 't') || [])[1];
  const sigs = parts.filter((p) => p[0] === 'v1').map((p) => p[1]);
  if (!t || !sigs.length) throw new Error('signature malformed');
  const age = Math.abs(Math.floor((now || Date.now()) / 1000) - Number(t));
  if (!(age <= TOLERANCE_SECONDS)) throw new Error('signature too old');
  const want = Buffer.from(sign(Buffer.isBuffer(payload) ? payload.toString('utf8') : String(payload), secret, t));
  const ok = sigs.some((s) => { const b = Buffer.from(String(s)); return b.length === want.length && crypto.timingSafeEqual(b, want); });
  if (!ok) throw new Error('signature does not match');
  return true;
}

module.exports = { sign, signatureHeader, verify, TOLERANCE_SECONDS };
