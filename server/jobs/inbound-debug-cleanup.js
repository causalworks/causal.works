const cron = require('node-cron');

function parseRetentionHours(envValue, fallbackHours) {
  const n = Number(envValue);
  if (!Number.isFinite(n) || n <= 0) return fallbackHours;
  return n;
}

async function runInboundDebugCleanup(pool, retentionHours) {
  const hours = parseRetentionHours(retentionHours, 24);
  try {
    await pool.query(
      `DELETE FROM inbound_debug_emails
       WHERE created_at < (NOW() - ($1::text || ' hours')::interval)`,
      [String(hours)]
    );
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/inbound_debug_emails/i.test(msg)) throw err;
  }
}

function scheduleInboundDebugCleanup(pool) {
  const enabled =
    String(process.env.DEBUG_INBOUND_STORE || '').toLowerCase() === 'true' ||
    String(process.env.DEBUG_INBOUND_STORE || '') === '1';
  if (!enabled) return;

  const retentionHours = process.env.DEBUG_INBOUND_RETENTION_HOURS || '24';

  cron.schedule(
    '17 * * * *',
    () => runInboundDebugCleanup(pool, retentionHours),
    { timezone: 'UTC' }
  );

  runInboundDebugCleanup(pool, retentionHours).catch(() => {});
}

module.exports = {
  scheduleInboundDebugCleanup,
  runInboundDebugCleanup,
};

