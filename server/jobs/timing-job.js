// timing-job.js — Causal Timing Intelligence Layer
// Scheduled job: matches actions to target entity decision windows,
// writes decision_window_date and decision_window_label back to DB.
//
// Runs daily at 03:00 UTC via node-cron.
// Rechecks ALL actions from last 60 days (not just nulls) so stale
// windows stay fresh as dates approach.

const cron = require('node-cron');
const { findNextWindow } = require('../entities/entities');

const LOOKBACK_DAYS = 60;

async function runTimingJob(pool) {
  console.log('⏱  Timing job starting...');

  let actions;
  try {
    const result = await pool.query(`
      SELECT id, org_name, leverage_point
      FROM actions
      WHERE created_at > NOW() - INTERVAL '${LOOKBACK_DAYS} days'
    `);
    actions = result.rows;
  } catch (err) {
    console.error('❌ Timing job: DB read failed:', err.message);
    return;
  }

  let matched = 0;
  let skipped = 0;

  for (const action of actions) {
    const hit = findNextWindow(action.org_name, action.leverage_point);

    if (!hit) {
      skipped++;
      continue;
    }

    try {
      await pool.query(
        `UPDATE actions
         SET decision_window_date = $1,
             decision_window_label = $2
         WHERE id = $3`,
        [hit.date, hit.label, action.id]
      );
      matched++;
      console.log(`  ✅ id=${action.id} → ${hit.label}`);
    } catch (err) {
      console.error(`  ❌ Failed to update action id=${action.id}:`, err.message);
    }
  }

  console.log(`⏱  Timing job done. ${matched} matched, ${skipped} skipped (no entity found).`);
}

function scheduleTimingJob(pool) {
  // Run at 03:00 UTC daily
  cron.schedule('0 3 * * *', () => runTimingJob(pool), { timezone: 'UTC' });
  console.log('⏱  Timing job scheduled (daily 03:00 UTC)');

  // Also run once at startup so fresh deploys don't wait until 3am
  runTimingJob(pool);
}

module.exports = { scheduleTimingJob, runTimingJob };