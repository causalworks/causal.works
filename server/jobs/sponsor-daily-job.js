// Daily sponsorship work: add the quarterly report rows, place or lift overdue-report holds, send report reminders,
// and make and send last month's project statements once the statement day has come.
const cron = require('node-cron');
const { sendReportReminders } = require('../organizational/lib/sponsorReports');
const { runStatementJob } = require('../organizational/lib/sponsorStatements');
const { wrapPoolWithOrgScoping } = require('../organizational/lib/scopedPool');

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
  try {
    const out = await runStatementJob(pool, wrapPoolWithOrgScoping(pool));
    if (out.made || out.failed) console.log('[sponsor-daily-job] statements made ' + out.made + ', failed ' + out.failed);
  } catch (err) {
    console.error('[sponsor-daily-job] statements failed:', err.message);
  }
}

function scheduleSponsorDailyJob(pool) {
  cron.schedule('25 4 * * *', () => runSponsorDailyJob(pool), { timezone: 'UTC' });
  runSponsorDailyJob(pool).catch((err) => console.error('[sponsor-daily-job] boot run failed:', err.message));
}

module.exports = { scheduleSponsorDailyJob, runSponsorDailyJob };
