'use strict';
// Signing secrets must come from the environment; there is no default.

const test = require('node:test');
const assert = require('node:assert');
const { adminValidateSecret, xeroStateSecret, assertSecretsSet } = require('../../server/secrets');

function withEnv(vars, fn) {
  const keys = ['ADMIN_VALIDATE_SECRET', 'XERO_STATE_SECRET', 'SESSION_SECRET'];
  const had = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  keys.forEach((k) => delete process.env[k]);
  Object.assign(process.env, vars);
  try { return fn(); } finally {
    keys.forEach((k) => { if (had[k] === undefined) delete process.env[k]; else process.env[k] = had[k]; });
  }
}

test('no secret set: refuses instead of using a fixed string', () => {
  withEnv({}, () => {
    assert.throws(() => adminValidateSecret(), /ADMIN_VALIDATE_SECRET/);
    assert.throws(() => xeroStateSecret(), /XERO_STATE_SECRET/);
    assert.throws(() => assertSecretsSet());
  });
});

test('own secret wins; SESSION_SECRET is the only fallback', () => {
  withEnv({ ADMIN_VALIDATE_SECRET: 'a', SESSION_SECRET: 's' }, () => assert.equal(adminValidateSecret(), 'a'));
  withEnv({ SESSION_SECRET: 's' }, () => { assert.equal(adminValidateSecret(), 's'); assert.equal(xeroStateSecret(), 's'); });
});
