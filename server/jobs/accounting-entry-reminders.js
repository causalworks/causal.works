'use strict';

const cron = require('node-cron');
const { sendPlainEmail } = require('../organizational/lib/sendPlainEmail');

async function runAccountingEntryReminders(pool) {
  const r = await pool.query(`SELECT * FROM accounting_entry_reminders_due()`);
  const domain = process.env.CAUSAL_DOMAIN || 'causal.works';
  for (const row of r.rows) {
    const link = `https://${domain}/organizational/o/${encodeURIComponent(row.org_slug)}/settings/organization`;
    await sendPlainEmail({
      to: row.email,
      fromName: row.org_name,
      subject: `${row.org_name}: keep accounting entry access switched on?`,
      text: [
        `Your own access to enter and edit accounting transactions in ${row.org_name} has been switched on for 30 days.`,
        '',
        'Settings > Organization lets you keep it on for another 30 days, or turn it off:',
        link,
        '',
        'If you no longer need it, turning it off keeps the accounting books separate from the person who administers the workspace.',
      ].join('\n'),
    });
  }
  if (r.rows.length) console.log(`[accounting-entry-reminders] sent ${r.rows.length} reminder(s)`);
}

function scheduleAccountingEntryReminders(pool) {
  cron.schedule('0 14 * * *', () => runAccountingEntryReminders(pool).catch((e) => console.error('[accounting-entry-reminders] run failed:', e.message)), { timezone: 'UTC' });
}

module.exports = { scheduleAccountingEntryReminders, runAccountingEntryReminders };
