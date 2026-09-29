#!/usr/bin/env node
/**
 * Backfill user_actions for subscribers of orgs for **causal** actions.
 *
 * Causal ingest does not fan-out at mail time (see server inbound). The **Petition**
 * feed still shows those actions via LEFT JOIN, but **Levers org stats** (completed/open
 * counts) and some analytics only see rows in user_actions — so existing followers
 * can look "empty" until they engage.
 *
 * This is NOT what `backfill-action-org-from-sender.js` does: that script only fixes
 * actions with NULL org_id, then fans out for those rows.
 *
 * Usage:
 *   node scripts/backfill-causal-user-actions.js              # last 120 days, live
 *   node scripts/backfill-causal-user-actions.js --dry-run    # print counts only
 *   node scripts/backfill-causal-user-actions.js --days=365    # wider window
 *   node scripts/backfill-causal-user-actions.js --all         # all causal (careful)
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
  const dryRun = argv.includes('--dry-run');
  const all = argv.includes('--all');
  let days = 120;
  const d = argv.find((a) => a.startsWith('--days='));
  if (d) {
    const n = parseInt(d.split('=')[1], 10);
    if (Number.isInteger(n) && n > 0) days = n;
  }
  return { dryRun, all, days };
}

async function main() {
  const { dryRun, all, days } = parseArgs(process.argv.slice(2));
  const pool = new Pool(poolConfig());

  const dateClause = all
    ? ''
    : `AND a.created_at >= NOW() - ($1::int * INTERVAL '1 day')`;
  const params = all ? [] : [days];

  const countSql = `
    SELECT COUNT(*)::bigint AS n
    FROM actions a
    INNER JOIN orgs o ON o.id = a.org_id
    INNER JOIN user_org_preferences uop ON uop.org_id = a.org_id
    WHERE COALESCE(a.source, 'user') = 'causal'
      AND COALESCE(o.subscription_status, 'active') = 'active'
      AND (a.feature_target = 'push' OR a.feature_target IS NULL)
      ${dateClause}
      AND NOT EXISTS (
        SELECT 1 FROM user_actions ua
        WHERE ua.user_id = uop.user_id AND ua.action_id = a.id
      )`;

  const insertSql = `
    INSERT INTO user_actions (user_id, action_id, seeded)
    SELECT uop.user_id, a.id, true
    FROM actions a
    INNER JOIN orgs o ON o.id = a.org_id
    INNER JOIN user_org_preferences uop ON uop.org_id = a.org_id
    WHERE COALESCE(a.source, 'user') = 'causal'
      AND COALESCE(o.subscription_status, 'active') = 'active'
      AND (a.feature_target = 'push' OR a.feature_target IS NULL)
      ${dateClause}
      AND NOT EXISTS (
        SELECT 1 FROM user_actions ua
        WHERE ua.user_id = uop.user_id AND ua.action_id = a.id
      )
    ON CONFLICT (user_id, action_id) DO NOTHING`;

  try {
    const { rows: c } = await pool.query(countSql, params);
    const wouldInsert = Number(c[0]?.n || 0);
    console.log(
      `${dryRun ? '[dry-run] ' : ''}Would insert ${wouldInsert} user_actions row(s) ` +
        (all ? '(all time)' : `(causal actions in last ${days} days × followers missing rows)`)
    );

    if (dryRun || wouldInsert === 0) {
      return;
    }

    const result = await pool.query(insertSql, params);
    console.log(`Inserted (new rows): ${result.rowCount}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
