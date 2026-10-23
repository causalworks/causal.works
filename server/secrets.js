'use strict';
// Signing secrets read from the environment. There is no built-in fallback value.

function needSecret(...names) {
  for (const n of names) {
    const v = process.env[n];
    if (v && String(v).trim()) return String(v);
  }
  throw new Error(`Missing secret: set ${names[0]} in .env`);
}

const adminValidateSecret = () => needSecret('ADMIN_VALIDATE_SECRET', 'SESSION_SECRET');
const xeroStateSecret = () => needSecret('XERO_STATE_SECRET', 'SESSION_SECRET');

function assertSecretsSet() {
  adminValidateSecret();
  xeroStateSecret();
}

module.exports = { needSecret, adminValidateSecret, xeroStateSecret, assertSecretsSet };
