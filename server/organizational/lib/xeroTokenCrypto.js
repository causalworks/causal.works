'use strict';

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

function isEncryptedEnvelope(v) {
  return !!v && typeof v === 'object' && typeof v.enc === 'string' && typeof v.iv === 'string' && typeof v.tag === 'string';
}

module.exports = { encryptToken, decryptToken, isEncryptedEnvelope };
