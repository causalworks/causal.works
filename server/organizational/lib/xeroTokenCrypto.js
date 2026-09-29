'use strict';

// AES-256-GCM encrypt/decrypt for Xero OAuth access/refresh tokens at rest,
// org_settings.xero_token_data. Same pattern as vendorTaxIdCrypto.js/podCredentialCrypto.js,
// deliberately its own key (XERO_TOKEN_ENCRYPTION_KEY) rather than reusing either of those --
// a leaked Xero-token key should not compromise vendor tax IDs or Solid pod credentials, and
// the three have unrelated rotation schedules. Same honest limit as those two helpers: a
// leaked env key plus DB access still exposes the data -- this narrows the blast radius of a
// DB-only compromise (a leaked pg_dump), not a full compromise.
//
// Unlike the tax-id/pod-credential helpers (separate SQL columns), this stores the ciphertext
// envelope as a nested object inside the existing xero_token_data JSONB blob -- the column
// already holds a flexible bag of fields (expires_at_ms, token_type, scope,
// last_token_persist_at) that need to stay plaintext and readable by other call sites
// (xero/status, OrganizationalAttentionFeed) without decrypting anything; only the two actual
// credential strings move into an encrypted envelope, in place of the plaintext strings that
// used to be there (see server/organizational/xero/org-tokens.js).

const crypto = require('crypto');

function getKey() {
  const hex = process.env.XERO_TOKEN_ENCRYPTION_KEY;
  if (!hex) throw new Error('XERO_TOKEN_ENCRYPTION_KEY not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(`XERO_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

function encryptToken(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    enc: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptToken({ enc, iv, tag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(enc, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/** True for the {enc, iv, tag} envelope shape this module produces. */
function isEncryptedEnvelope(v) {
  return !!v && typeof v === 'object' && typeof v.enc === 'string' && typeof v.iv === 'string' && typeof v.tag === 'string';
}

module.exports = { encryptToken, decryptToken, isEncryptedEnvelope };
