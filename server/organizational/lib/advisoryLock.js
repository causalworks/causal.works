'use strict';

// Database lock that lets one caller at a time through a money action, so a double-click or retry cannot post twice.

const NS = {
  projectMoney: 360010,
  recallPost: 360011,
  closingPost: 360012,
  duesPayment: 360013,
  duesRecognition: 360014,
  paymentEvent: 360015,
};

const WAIT_MS = 15000;
const POLL_MS = 40;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function withLock(pool, namespace, key, fn, busyResult) {
  if (!Number.isInteger(Number(key))) throw new Error('withLock needs a numeric key');
  const deadline = Date.now() + WAIT_MS;
  for (;;) {
    const client = await pool.connect();
    let held = false;
    try {
      const got = await client.query('SELECT pg_try_advisory_lock($1, $2) AS ok', [namespace, key]);
      held = got.rows[0].ok === true;
      if (held) return await fn();
    } finally {
      if (held) await client.query('SELECT pg_advisory_unlock($1, $2)', [namespace, key]).catch(() => {});
      client.release();
    }
    if (Date.now() >= deadline) return busyResult;
    await sleep(POLL_MS);
  }
}

const BUSY = { httpStatus: 409, body: { code: 'busy', error: 'Another change to this record is in progress. Try again in a moment.' } };

module.exports = { NS, withLock, BUSY };
