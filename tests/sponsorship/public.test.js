'use strict';

// Shared public module as plain functions: the token-bucket limiter, the signed form token (minimum time), token hashing.

const test = require('node:test');
const assert = require('node:assert/strict');
const { createBucketLimiter } = require('../../server/organizational/lib/rateLimit');
const { issueFormToken, checkFormToken, hashToken, newToken } = require('../../server/organizational/lib/publicLinks');

test('token bucket: allows the capacity, refuses the next, refills over time', () => {
  let t = 0;
  const lim = createBucketLimiter({ capacity: 3, refillPerMinute: 6, now: () => t });
  assert.ok(lim.take('a').ok && lim.take('a').ok && lim.take('a').ok);
  const no = lim.take('a');
  assert.equal(no.ok, false);
  assert.equal(no.retryAfterSeconds, 10);
  assert.equal(lim.take('b').ok, true);
  t += 10000;
  assert.equal(lim.take('a').ok, true);
  assert.equal(lim.take('a').ok, false);
});

test('form token: too fast, fine, too old, tampered, other workspace', () => {
  const t0 = 1700000000000;
  const tok = issueFormToken(7, t0);
  assert.equal(checkFormToken(7, tok, t0 + 1000), 'too_fast');
  assert.equal(checkFormToken(7, tok, t0 + 5000), null);
  assert.equal(checkFormToken(7, tok, t0 + 3 * 3600 * 1000), 'form_expired');
  assert.equal(checkFormToken(7, tok.slice(0, -2) + 'xx', t0 + 5000), 'form_token_bad');
  assert.equal(checkFormToken(8, tok, t0 + 5000), 'form_token_bad');
  assert.equal(checkFormToken(7, '', t0), 'form_token_missing');
});

test('tokens are long and random, and only a hash is kept', () => {
  const a = newToken();
  const b = newToken();
  assert.notEqual(a, b);
  assert.ok(Buffer.from(a, 'base64url').length === 32);
  assert.equal(hashToken(a).length, 64);
  assert.notEqual(hashToken(a), a);
});
