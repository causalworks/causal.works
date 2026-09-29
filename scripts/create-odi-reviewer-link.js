#!/usr/bin/env node
/**
 * One-off: create (or reuse) the ODI Solid-review account and issue a reusable,
 * non-consuming login link for it. See .claude/plans/2026-09-23-odi-workspace-splash.md
 * and migration 267 for why this exists and how it differs from a real magic link.
 *
 * Usage:
 *   node scripts/create-odi-reviewer-link.js
 *   node scripts/create-odi-reviewer-link.js --revoke-existing   # revoke prior links for this user first
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const crypto = require('crypto');
const { registerUser } = require('../server/auth');

const REVIEWER_EMAIL = 'solid@theodi.org';
const REVIEWER_NAME = 'ODI Solid Reviewer';
const EXPIRES_AT = '2026-12-01T00:00:00Z'; // past the Oct 19-30 interview window, with buffer

function poolConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'causal_db',
  };
}

async function main() {
  const pool = new Pool(poolConfig());
  const revokeExisting = process.argv.includes('--revoke-existing');

  const user = await registerUser(pool, REVIEWER_EMAIL, null, REVIEWER_NAME, null);
  console.log(`Reviewer user: id=${user.id} email=${user.email} (demo-company membership auto-bootstrapped)`);

  if (revokeExisting) {
    const r = await pool.query(
      `UPDATE reviewer_access_links SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
      [user.id]
    );
    console.log(`Revoked ${r.rowCount} existing link(s) for this user.`);
  }

  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    `INSERT INTO reviewer_access_links (token, user_id, label, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [token, user.id, 'ODI Solid open call review', EXPIRES_AT]
  );

  const baseUrl = process.env.BASE_URL || 'https://causal.works';
  console.log('\nReviewer access link (share this, not a password):');
  console.log(`${baseUrl}/auth/reviewer?token=${token}`);
  console.log(`\nValid until: ${EXPIRES_AT}`);

  await pool.end();
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
