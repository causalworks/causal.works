#!/usr/bin/env node
/**
 * Print a tab-separated report of user_actions (all users) for admin / ops.
 *
 * Usage:
 *   node scripts/report-user-actions.js
 *   node scripts/report-user-actions.js --limit=500
 *   node scripts/report-user-actions.js --email=alice@   # ILIKE filter on user email
 *
 * Requires .env with DB_* same as the app (see other scripts in this folder).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

function poolConfig() {
  return {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'causal_db',
  };
}

function parseArgs(argv) {
  let limit = 300;
  let email = null;
  for (const a of argv) {
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.split('=')[1], 10);
      if (Number.isInteger(n) && n > 0 && n <= 10000) limit = n;
    }
    if (a.startsWith('--email=')) {
      email = String(a.split('=').slice(1).join('=') || '').trim() || null;
    }
  }
  return { limit, email };
}

function fmtTs(t) {
  if (!t) return '';
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function escTab(s) {
  if (s == null) return '';
  return String(s).replace(/\t/g, ' ').replace(/\r?\n/g, ' ');
}

async function main() {
  const { limit, email } = parseArgs(process.argv.slice(2));
  const pool = new Pool(poolConfig());
  try {
    const params = [limit];
    let whereEmail = '';
    if (email) {
      params.push(`%${email}%`);
      whereEmail = `AND u.email ILIKE $2`;
    }
    const sql = `
      SELECT
        u.email AS user_email,
        a.id AS action_id,
        COALESCE(o.name, a.org_name, '') AS org_name,
        LEFT(COALESCE(a.action_ask, ''), 200) AS ask_preview,
        ua.received_at,
        ua.opened_at,
        ua.completed_at,
        ua.dismissed_at,
        ua.seeded
      FROM user_actions ua
      JOIN users u ON u.id = ua.user_id
      JOIN actions a ON a.id = ua.action_id
      LEFT JOIN orgs o ON o.id = a.org_id
      WHERE 1=1 ${whereEmail}
      ORDER BY COALESCE(ua.completed_at, ua.dismissed_at, ua.opened_at, ua.received_at) DESC NULLS LAST
      LIMIT $1`;
    const { rows } = await pool.query(sql, params);
    const headers = ['user_email', 'action_id', 'org_name', 'ask_preview', 'received_at', 'opened_at', 'completed_at', 'dismissed_at', 'seeded'];
    console.log(headers.join('\t'));
    for (const r of rows) {
      console.log(
        [
          escTab(r.user_email),
          r.action_id,
          escTab(r.org_name),
          escTab(r.ask_preview),
          fmtTs(r.received_at),
          fmtTs(r.opened_at),
          fmtTs(r.completed_at),
          fmtTs(r.dismissed_at),
          r.seeded ? 'true' : 'false',
        ].join('\t')
      );
    }
    console.error(`# rows: ${rows.length}, limit=${limit}${email ? `, email ILIKE %${email}%` : ''}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
