#!/usr/bin/env node
/**
 * Maintenance: for actions with NULL org_id, try to recover sender_email from raw_content (From: line),
 * then resolve org_id using sender domain + org_aliases (same logic as inbound).
 * Fans out new user_actions rows to followers of the resolved org (and the action's user_id if set).
 *
 * Requires migration 018_actions_sender_metadata.sql (sender_email / reply_to_email columns).
 *
 * Usage: node scripts/backfill-action-org-from-sender.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');
const {
  extractSenderEmailFromRawContent,
  resolveOrgForInboundUserSource,
} = require('../server/org-resolution');

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
  try {
    const { rows: needSender } = await pool.query(`
      SELECT id, raw_content FROM actions
      WHERE (sender_email IS NULL OR sender_email = '')
        AND raw_content IS NOT NULL
        AND length(trim(raw_content)) > 10
    `);
    let extracted = 0;
    for (const row of needSender) {
      const em = extractSenderEmailFromRawContent(row.raw_content);
      if (em && !em.includes('causal.works')) {
        const up = await pool.query(
          `UPDATE actions SET sender_email = $1 WHERE id = $2 AND (sender_email IS NULL OR sender_email = '')`,
          [em, row.id]
        );
        if (up.rowCount) extracted += 1;
      }
    }
    console.log(`sender_email extracted from raw_content: ${extracted} row(s)`);

    const { rows: unmapped } = await pool.query(`
      SELECT id, org_name, sender_email, reply_to_email, user_id
      FROM actions
      WHERE org_id IS NULL
        AND sender_email IS NOT NULL
        AND sender_email <> ''
    `);
    let mapped = 0;
    let fanoutRows = 0;
    for (const row of unmapped) {
      const res = await resolveOrgForInboundUserSource(
        pool,
        row.sender_email,
        row.reply_to_email || '',
        row.org_name
      );
      if (!res.org_id) continue;

      await pool.query(`UPDATE actions SET org_id = $1, org_name = $2 WHERE id = $3`, [
        res.org_id,
        res.org_name,
        row.id,
      ]);

      const subs = await pool.query(
        `SELECT user_id FROM user_org_preferences WHERE org_id = $1`,
        [res.org_id]
      );
      const ids = new Set(subs.rows.map((r) => r.user_id));
      if (row.user_id) ids.add(row.user_id);
      for (const uid of ids) {
        const ins = await pool.query(
          `INSERT INTO user_actions (user_id, action_id) VALUES ($1, $2) ON CONFLICT (user_id, action_id) DO NOTHING`,
          [uid, row.id]
        );
        fanoutRows += ins.rowCount;
      }
      mapped += 1;
    }
    console.log(`org_id resolved via sender (+aliases): ${mapped} action(s), user_actions inserts: ${fanoutRows}`);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
