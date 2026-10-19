// Daily: put sponsored projects with an overdue report on hold, and lift automatic holds once the report is in.
const cron = require('node-cron');

async function runSponsorReportHoldJob(pool) {
  try {
    const r = await pool.query('SELECT * FROM org_apply_sponsor_report_holds()');
    if (r.rows.length) {
      console.log('[sponsor-report-hold-job] ' + r.rows.map((x) => x.action + ' project ' + x.sponsored_project_id).join(', '));
    }
  } catch (err) {
    console.error('[sponsor-report-hold-job] failed:', err.message);
  }
}

function scheduleSponsorReportHoldJob(pool) {
  cron.schedule('25 4 * * *', () => runSponsorReportHoldJob(pool), { timezone: 'UTC' });
  runSponsorReportHoldJob(pool).catch((err) => console.error('[sponsor-report-hold-job] boot run failed:', err.message));
}

module.exports = { scheduleSponsorReportHoldJob, runSponsorReportHoldJob };
