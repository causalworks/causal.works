const cron = require('node-cron');

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
  cron.schedule('15 4 * * *', () => runRecurringScheduleJob(pool), { timezone: 'UTC' });

  runRecurringScheduleJob(pool).catch((err) => console.error('[recurring-schedule-job] boot run failed:', err.message));
}

module.exports = { scheduleRecurringScheduleJob, runRecurringScheduleJob };
