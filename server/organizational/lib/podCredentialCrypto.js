'use strict';

// AES-256-GCM encrypt/decrypt for Solid pod credentials at rest
// (org_pod_credentials, coop_pod_credentials). See migration 175's header
// comment and DevPath rev 55 for why this exists and its honest limits: a
// leaked POD_CREDENTIAL_ENCRYPTION_KEY plus DB access still exposes every
// credential - this narrows the blast radius of a DB-only compromise, it
// does not eliminate the .env-held root key as a factor.

const crypto = require('crypto');

function getKey() {
  const hex = process.env.POD_CREDENTIAL_ENCRYPTION_KEY;
  if (!hex) throw new Error('POD_CREDENTIAL_ENCRYPTION_KEY not set');
  const key = Buffer.from(hex, 'hex');
  if (key.length !== 32) {
    throw new Error(`POD_CREDENTIAL_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length})`);
  }
  return key;
}

function encryptCredential(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
  };
}

function decryptCredential({ encrypted, iv, authTag }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

module.exports = { encryptCredential, decryptCredential };
