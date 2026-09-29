'use strict';

// AES-256-GCM encrypt/decrypt for vendor tax IDs (EIN/SSN) at rest, org_vendor_compliance.
// Same pattern as podCredentialCrypto.js, deliberately its own key
// (VENDOR_TAX_ID_ENCRYPTION_KEY) rather than reusing POD_CREDENTIAL_ENCRYPTION_KEY -- a leaked
// pod key and a leaked tax-ID key should not compromise each other, and the two have unrelated
// rotation schedules. Same honest limit as the pod credential helper: a leaked env key plus DB
// access still exposes the data -- this narrows the blast radius of a DB-only compromise, not
// a full compromise.

const crypto = require('crypto');

function getKey() {
  const hex = process.env.VENDOR_TAX_ID_ENCRYPTION_KEY;
  if (!hex) throw new Error('VENDOR_TAX_ID_ENCRYPTION_KEY not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(`VENDOR_TAX_ID_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

function encryptTaxId(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptTaxId({ encrypted, iv, authTag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encryptTaxId, decryptTaxId };
