const cron = require('node-cron');

/** Generates a draft bill/invoice for every org_recurring_schedules row whose
 *  next_occurrence_date has arrived, then advances the cursor. See migration 216
 *  (org_run_due_recurring_schedules, SECURITY DEFINER -- this is a genuine cross-org batch job,
 *  same reasoning as admin_delete_org). Generated documents land in Draft; nothing here submits,
 *  approves, or sends on anyone's behalf. */
async function runRecurringScheduleJob(pool) {
  try {
    const r = await pool.query(`SELECT * FROM org_run_due_recurring_schedules()`);
    if (r.rows.length) {
      console.log(`[recurring-schedule-job] generated ${r.rows.length} document(s): ` +
        r.rows.map((row) => `${row.generated_kind}#${row.generated_id} (schedule ${row.schedule_id})`).join(', '));
    }
  } catch (err) {
    console.error('[recurring-schedule-job] failed:', err.message);
  }
}

function scheduleRecurringScheduleJob(pool) {
  // Daily at 04:15 UTC, off-peak and offset from the other scheduled jobs.
  cron.schedule('15 4 * * *', () => runRecurringScheduleJob(pool), { timezone: 'UTC' });

  // Eager run on boot, matching the other jobs' pattern.
  runRecurringScheduleJob(pool).catch((err) => console.error('[recurring-schedule-job] boot run failed:', err.message));
}

module.exports = { scheduleRecurringScheduleJob, runRecurringScheduleJob };
