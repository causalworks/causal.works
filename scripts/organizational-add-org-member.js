#!/usr/bin/env node
/**
 * Link an existing user to an existing NP workspace (np_org_users).
 * Use when the org row exists (slug "already in use") but the user has no membership.
 *
 * Usage (from repo root, with .env DB_* set):
 *   node scripts/np-add-org-member.js --email user@example.com --slug org-slug [--role admin|staff|board]
 *
 * Default role: admin
 */
'use strict';

require('dotenv').config();
const { Pool } = require('pg');

const ROLES = new Set(['admin', 'staff', 'board']);

function parseArgs() {
  const out = { email: '', slug: '', role: 'admin' };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--email' && argv[i + 1]) {
      out.email = String(argv[++i]).trim().toLowerCase();
    } else if (a === '--slug' && argv[i + 1]) {
      out.slug = String(argv[++i]).trim();
    } else if (a === '--role' && argv[i + 1]) {
      out.role = String(argv[++i]).trim().toLowerCase();
    }
  }
  return out;
}

async function main() {
  const { email, slug, role } = parseArgs();
  if (!email || !slug) {
    console.error('Usage: node scripts/np-add-org-member.js --email user@example.com --slug org-slug [--role admin]');
    process.exit(1);
  }
  if (!ROLES.has(role)) {
    console.error(`role must be one of: ${[...ROLES].join(', ')}`);
    process.exit(1);
  }

  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'causal_db',
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT || 5432,
  });

  try {
    const ur = await pool.query('SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1', [email]);
    if (ur.rows.length === 0) {
      console.error(`No user with email: ${email}`);
      process.exit(2);
    }
    const userId = ur.rows[0].id;

    const orgr = await pool.query(
      'SELECT id, slug, display_name FROM np_orgs WHERE slug = $1 LIMIT 1',
      [slug]
    );
    if (orgr.rows.length === 0) {
      console.error(`No np_orgs row with slug: ${slug}`);
      process.exit(3);
    }
    const npOrgId = orgr.rows[0].id;

    const ins = await pool.query(
      `INSERT INTO np_org_users (np_org_id, user_id, role)
       VALUES ($1, $2, $3::np_org_member_role)
       ON CONFLICT (np_org_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING id, role::text AS role`,
      [npOrgId, userId, role]
    );

    console.log('OK — membership saved');
    console.log('  user:', email, `(id ${userId})`);
    console.log('  org:', orgr.rows[0].display_name, `(id ${npOrgId}, slug ${orgr.rows[0].slug})`);
    console.log('  role:', ins.rows[0].role);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
