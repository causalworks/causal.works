// Daily sponsorship work: add the quarterly report rows, place or lift overdue-report holds, and send report reminders.
const cron = require('node-cron');
const { sendReportReminders } = require('../organizational/lib/sponsorReports');

async function runSponsorDailyJob(pool) {
  try {
    const g = await pool.query('SELECT org_generate_sponsor_quarterly_reports() AS n');
    if (Number(g.rows[0].n)) console.log('[sponsor-daily-job] added ' + g.rows[0].n + ' quarterly report row(s)');
  } catch (err) {
    console.error('[sponsor-daily-job] report rows failed:', err.message);
  }
  try {
    const r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    if (r.rows.length) console.log('[sponsor-daily-job] ' + r.rows.map((x) => x.action + ' hold on project ' + x.sponsored_project_id).join(', '));
  } catch (err) {
    console.error('[sponsor-daily-job] holds failed:', err.message);
  }
  try {
    const out = await sendReportReminders(pool);
    if (out.sent || out.failed || out.skipped) console.log('[sponsor-daily-job] reminders sent ' + out.sent + ', failed ' + out.failed + ', skipped ' + out.skipped);
  } catch (err) {
    console.error('[sponsor-daily-job] reminders failed:', err.message);
  }
}

function scheduleSponsorDailyJob(pool) {
  cron.schedule('25 4 * * *', () => runSponsorDailyJob(pool), { timezone: 'UTC' });
  runSponsorDailyJob(pool).catch((err) => console.error('[sponsor-daily-job] boot run failed:', err.message));
}

module.exports = { scheduleSponsorDailyJob, runSponsorDailyJob };
