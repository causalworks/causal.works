#!/usr/bin/env node
/**
 * Backfill user_actions for **source='user'** actions that have a resolved org_id:
 * insert a row for each current org follower who does not already have one.
 *
 * Use when historical ingests only attached the forwarder's row, or followers subscribed later.
 *
 * Also clears actions.user_id for those actions (org-wide user-sourced content should not
 * expose the forwarder on the action row — matches server inbound behaviour).
 *
 * Usage:
 *   node scripts/backfill-user-source-actions.js --dry-run
 *   node scripts/backfill-user-source-actions.js
 *   node scripts/backfill-user-source-actions.js --days=365 --all
 *   node scripts/backfill-user-source-actions.js --no-scrub-user-id   # only insert user_actions
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
  const noScrub = argv.includes('--no-scrub-user-id');
  let days = 120;
  const d = argv.find((a) => a.startsWith('--days='));
  if (d) {
    const n = parseInt(d.split('=')[1], 10);
    if (Number.isInteger(n) && n > 0) days = n;
  }
  return { dryRun, all, days, noScrub };
}

async function main() {
  const { dryRun, all, days, noScrub } = parseArgs(process.argv.slice(2));
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
    WHERE COALESCE(a.source, 'user') = 'user'
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
    WHERE COALESCE(a.source, 'user') = 'user'
      AND COALESCE(o.subscription_status, 'active') = 'active'
      AND (a.feature_target = 'push' OR a.feature_target IS NULL)
      ${dateClause}
      AND NOT EXISTS (
        SELECT 1 FROM user_actions ua
        WHERE ua.user_id = uop.user_id AND ua.action_id = a.id
      )
    ON CONFLICT (user_id, action_id) DO NOTHING`;

  const scrubCountSql = `
    SELECT COUNT(*)::bigint AS n
    FROM actions a
    INNER JOIN orgs o ON o.id = a.org_id
    WHERE COALESCE(a.source, 'user') = 'user'
      AND a.org_id IS NOT NULL
      AND a.user_id IS NOT NULL
      ${dateClause}`;

  const scrubSql = `
    UPDATE actions a
    SET user_id = NULL
    FROM orgs o
    WHERE a.org_id = o.id
      AND COALESCE(a.source, 'user') = 'user'
      AND a.org_id IS NOT NULL
      AND a.user_id IS NOT NULL
      AND COALESCE(o.subscription_status, 'active') = 'active'
      ${dateClause}`;

  try {
    if (!noScrub) {
      const { rows: sc } = await pool.query(scrubCountSql, params);
      const scrubN = Number(sc[0]?.n || 0);
      console.log(
        `${dryRun ? '[dry-run] ' : ''}Would clear user_id on ${scrubN} action row(s) (user-sourced + org_id, was set)`
      );
      if (!dryRun && scrubN > 0) {
        const sr = await pool.query(scrubSql, params);
        console.log(`Cleared actions.user_id on ${sr.rowCount} row(s)`);
      }
    }

    const { rows: c } = await pool.query(countSql, params);
    const wouldInsert = Number(c[0]?.n || 0);
    console.log(
      `${dryRun ? '[dry-run] ' : ''}Would insert ${wouldInsert} user_actions row(s) ` +
        (all ? '(all time)' : `(user-sourced actions in last ${days} days × followers missing rows)`)
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
