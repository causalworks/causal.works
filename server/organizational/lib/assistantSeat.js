'use strict';

// The assistant's seat in a workspace and the Off/Background/Assistant mode that decides whether it works at all.

const MODES = ['off', 'background', 'assistant'];
const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;

async function liveSeat(pool, orgId) {
  const r = await pool.query(
    `SELECT id, reason, granted_by, starts_at, ends_at, renewed_at FROM org_assistant_seats
      WHERE org_id = $1 AND revoked_at IS NULL AND starts_at <= now() AND ends_at > now()`, [orgId]);
  return r.rows[0] || null;
}

// A new grant replaces a seat that has already ended; it refuses while one is still live.
async function grantSeat(pool, { orgId, userId, reason, days = DEFAULT_DAYS }) {
  const d = Number(days);
  if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) return { httpStatus: 400, body: { error: `days must be 1 to ${MAX_DAYS}` } };
  if (!reason || String(reason).trim().length < 5) return { httpStatus: 400, body: { error: 'Give a reason of at least 5 characters' } };
  if (await liveSeat(pool, orgId)) return { httpStatus: 409, body: { error: 'The assistant already has a seat; renew or revoke it' } };
  await pool.query(`UPDATE org_assistant_seats SET revoked_at = now(), revoked_by = $2 WHERE org_id = $1 AND revoked_at IS NULL`, [orgId, userId]);
  const r = await pool.query(
    `INSERT INTO org_assistant_seats (org_id, reason, granted_by, ends_at) VALUES ($1, $2, $3, now() + make_interval(days => $4)) RETURNING id, ends_at`,
    [orgId, String(reason).trim(), userId, d]);
  return { httpStatus: 201, body: { seat: r.rows[0] } };
}

async function renewSeat(pool, { orgId, days = DEFAULT_DAYS }) {
  const d = Number(days);
  if (!Number.isInteger(d) || d < 1 || d > MAX_DAYS) return { httpStatus: 400, body: { error: `days must be 1 to ${MAX_DAYS}` } };
  const r = await pool.query(
    `UPDATE org_assistant_seats SET ends_at = now() + make_interval(days => $2), renewed_at = now()
      WHERE org_id = $1 AND revoked_at IS NULL AND ends_at > now() RETURNING id, ends_at`, [orgId, d]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'No live seat to renew' } };
  return { httpStatus: 200, body: { seat: r.rows[0] } };
}

async function revokeSeat(pool, { orgId, userId }) {
  const r = await pool.query(`UPDATE org_assistant_seats SET revoked_at = now(), revoked_by = $2 WHERE org_id = $1 AND revoked_at IS NULL RETURNING id`, [orgId, userId]);
  if (!r.rows.length) return { httpStatus: 404, body: { error: 'No seat to revoke' } };
  return { httpStatus: 200, body: { revoked: true } };
}

// A person's own setting wins over the workspace default.
async function effectiveMode(pool, orgId, userId) {
  const r = await pool.query(
    `SELECT s.assistant_mode AS org_mode, (SELECT ou.assistant_mode FROM org_users ou WHERE ou.org_id = $1 AND ou.user_id = $2) AS user_mode
       FROM org_settings s WHERE s.org_id = $1`, [orgId, userId || null]);
  const row = r.rows[0];
  return (row && (row.user_mode || row.org_mode)) || 'off';
}

async function setWorkspaceMode(pool, orgId, mode) {
  if (!MODES.includes(mode)) return { httpStatus: 400, body: { error: 'Invalid mode' } };
  await pool.query('UPDATE org_settings SET assistant_mode = $2 WHERE org_id = $1', [orgId, mode]);
  return { httpStatus: 200, body: { mode } };
}

async function setUserMode(pool, orgId, userId, mode) {
  if (mode !== null && !MODES.includes(mode)) return { httpStatus: 400, body: { error: 'Invalid mode' } };
  await pool.query('UPDATE org_users SET assistant_mode = $3 WHERE org_id = $1 AND user_id = $2', [orgId, userId, mode]);
  return { httpStatus: 200, body: { mode } };
}

// Context for server code acting as the assistant for a person's workspace. Refused when the mode is off for that person or there is no live seat.
async function assistantContext(pool, { orgId, forUserId = null, proposal = {} }) {
  const mode = await effectiveMode(pool, orgId, forUserId);
  if (mode === 'off') return { refused: 'The assistant is off in this workspace' };
  const seat = await liveSeat(pool, orgId);
  if (!seat) return { refused: 'The assistant has no live seat in this workspace' };
  return { ctx: { pool, orgId, userId: null, seatId: seat.id, actor: 'assistant', programScope: null, meta: { assistant_seat: seat.id }, mode, proposal } };
}

module.exports = { MODES, liveSeat, grantSeat, renewSeat, revokeSeat, effectiveMode, setWorkspaceMode, setUserMode, assistantContext };
