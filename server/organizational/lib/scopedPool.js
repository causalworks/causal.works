'use strict';

const { getCurrentOrgId, getCurrentUserId, getCurrentProgramScope } = require('./orgContext');

// Turns a program-scope value (null = no restriction, int[] = restrict to
// these ids, possibly empty) into the string form the app.current_program_ids
// GUC and current_program_ids() (migration 260) expect. ALWAYS returns an
// explicit value now -- never null/"leave it untouched" -- because a custom
// Postgres GUC that has ever been SET on a session cannot revert to a
// genuinely unset state (SET LOCAL's "revert at COMMIT" and even RESET both
// leave it at '', not NULL, confirmed live 2026-09-21 against a real pg.Pool
// reuse). Migration 259 left this GUC untouched whenever scope was null,
// which meant a pooled connection previously used by a program-scoped
// request would leak its decayed '' value ("restricted to nothing") into a
// LATER, unrelated admin/finance request on that same connection -- a real,
// reproduced bug, not a hypothetical one. '*' is the new explicit sentinel
// for "no restriction"; every other case is unchanged.
function programScopeGucValue(scope) {
  if (scope == null) return '*';
  return scope.join(',');
}

// RLS enforcement, part 3: a drop-in pool wrapper. Every organizational
// route already receives `pool` as a constructor argument from
// mountOrganizationalRoutes(app, pool) -- wrapping it once, at that mount
// boundary, means every existing pool.query()/pool.connect() call site
// across every route file automatically becomes scoped whenever a request
// context is active (see orgContext.js), with no changes needed to any of
// those hundreds of call sites, current or future.
//
// Two GUCs get set when available: app.current_org_id (satisfies every
// org_* table's org-isolation policy once an org is known) and
// app.current_user_id (satisfies org_users' self-visibility policy,
// migration 152 -- lets a user look up their OWN org_users rows before an
// org id is known at all, closing the bootstrapping gap generally instead
// of requiring a SECURITY DEFINER function at every such call site).
//
// The underlying `pool` object itself is never mutated -- this returns a
// new object, so anything else holding a reference to the raw pool
// (server.js, scheduled jobs, the Individual app) is completely unaffected
// and keeps its original, unscoped behavior.

// Loud-failure detection for the exact bug signature behind three real
// incidents this session (most recently DevPath rev 56, credential storage
// silently no-op'd and a real credential was lost as a result): a write
// against a FORCE-RLS table with no org/user context set doesn't error, it
// just silently affects 0 rows, because RLS has nothing to match against.
// This doesn't fix that class of bug (see rev 56's follow-up discussion --
// the real fix per table is either entering context correctly or, where the
// org_id is always an explicit trusted input rather than session-derived,
// routing through a SECURITY DEFINER function the way org_pod_credentials
// now does). It just makes the failure loud and immediate instead of a
// silent wrong-state discovered days later in a production error log.
let forceRlsTablesCache = null;
let forceRlsTablesCacheAt = 0;
const FORCE_RLS_CACHE_TTL_MS = 5 * 60 * 1000;

async function getForceRlsTables(pool) {
  const now = Date.now();
  if (forceRlsTablesCache && now - forceRlsTablesCacheAt < FORCE_RLS_CACHE_TTL_MS) {
    return forceRlsTablesCache;
  }
  try {
    const r = await pool.query(`SELECT relname FROM pg_class WHERE relforcerowsecurity = true AND relkind = 'r'`);
    forceRlsTablesCache = new Set(r.rows.map((row) => row.relname));
    forceRlsTablesCacheAt = now;
  } catch (err) {
    console.error('[scopedPool] could not refresh FORCE RLS table list for silent-failure detection:', err.message);
    forceRlsTablesCache = forceRlsTablesCache || new Set();
  }
  return forceRlsTablesCache;
}

function extractWriteTarget(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(/^\s*(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?([a-zA-Z_][a-zA-Z0-9_]*)"?/i);
  return m ? m[1].toLowerCase() : null;
}

async function checkForSilentRlsFailure(pool, text, result) {
  const table = extractWriteTarget(text);
  if (!table || result.rowCount !== 0) return;
  const rlsTables = await getForceRlsTables(pool);
  if (!rlsTables.has(table)) return;
  console.warn(
    `[scopedPool] SUSPICIOUS: a write to FORCE-RLS table "${table}" affected 0 rows with NO org/user context set. ` +
    `This is the exact silent-failure signature behind a real incident (DevPath rev 56, a lost pod credential). ` +
    `If this call site always has an explicit, trusted org_id (not session-derived), route it through a ` +
    `SECURITY DEFINER function instead of relying on RLS context, the way org_pod_credentials now does. ` +
    `Query: ${text.slice(0, 200)}`
  );
}

async function scopedQuery(pool, text, params) {
  const orgId = getCurrentOrgId();
  const userId = getCurrentUserId();
  const programScopeValue = programScopeGucValue(getCurrentProgramScope());
  if (orgId == null && userId == null) {
    const result = await pool.query(text, params);
    checkForSilentRlsFailure(pool, text, result).catch((err) => {
      console.error('[scopedPool] silent-RLS-failure check itself failed:', err.message);
    });
    return result;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (orgId != null) {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgId)]);
    }
    if (userId != null) {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
    }
    // Always set this GUC explicitly when org context applies -- never skip the call, even for
    // "no restriction" (see programScopeGucValue's comment: an unset custom GUC can decay to a
    // stale value from a previous transaction on a reused pooled connection).
    if (orgId != null) {
      await client.query('SELECT set_config($1, $2, true)', ['app.current_program_ids', programScopeValue]);
    }
    const result = await client.query(text, params);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Wraps a checked-out client so that, the first time it sees its own BEGIN
 * go by, it immediately injects whichever set_config('app.current_*', ...,
 * true) calls apply into that same transaction before returning control to
 * the caller. set_config's `is_local=true` only actually scopes to the
 * transaction when one is already open -- calling it before BEGIN would
 * silently behave like a session-wide SET instead, which would leak across
 * this connection's next reuse from the pool. Piggybacking on the caller's
 * own BEGIN (every manual-transaction call site in this codebase issues
 * `client.query('BEGIN')` as its first statement) avoids that entirely.
 *
 * Safety net (found live, rev 42 follow-up): a manual-transaction route
 * that BEGINs but exits (early return, uncaught error path) without ever
 * COMMIT/ROLLBACK leaves that transaction open when client.release() runs
 * -- pg does not auto-rollback on release. A "local" set_config from that
 * abandoned transaction then never resets, and the NEXT unrelated request
 * to borrow this same raw connection inherits the stale (or, if two such
 * leaks stack, actively wrong) app.current_org_id -- surfacing as RLS
 * policies casting garbage/empty GUC values, or silently reading the wrong
 * org's data. Every route's own BEGIN/COMMIT/ROLLBACK discipline should
 * already prevent this, but tracking transaction state here and forcing a
 * ROLLBACK before the client actually returns to the pool closes the gap
 * regardless of which call site (present or future) gets it wrong.
 */
function wrapClientForScope(client, orgId, userId, programScopeValue) {
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  let primed = false;
  let txOpen = false;
  // The wrapper stays on this physical client after release, so the pool's own pool.query() later
  // calls it as client.query(text, values, callback). An async wrapper that only took (text, params)
  // dropped that callback: the query ran but pg-pool never heard back, so the caller hung forever
  // and the connection was never returned (the Cooperative onboarding 60s hang / 502, 2026-09-25).
  // Callback-style calls are passed straight through untouched.
  client.query = function (text, params, cb) {
    if (typeof params === 'function' || typeof cb === 'function') {
      return originalQuery(text, params, cb);
    }
    return wrappedPromiseQuery(text, params);
  };
  const wrappedPromiseQuery = async function (text, params) {
    const result = await originalQuery(text, params);
    if (typeof text === 'string') {
      if (/^\s*BEGIN\b/i.test(text)) txOpen = true;
      else if (/^\s*(COMMIT|ROLLBACK)\b/i.test(text)) txOpen = false;
    }
    if (!primed && typeof text === 'string' && /^\s*BEGIN\b/i.test(text)) {
      primed = true;
      if (orgId != null) {
        await originalQuery('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgId)]);
      }
      if (userId != null) {
        await originalQuery('SELECT set_config($1, $2, true)', ['app.current_user_id', String(userId)]);
      }
      // Always set explicitly when org context applies -- see programScopeGucValue's comment.
      if (orgId != null) {
        await originalQuery('SELECT set_config($1, $2, true)', ['app.current_program_ids', programScopeValue]);
      }
    }
    return result;
  };
  client.release = function (arg) {
    if (!txOpen) return originalRelease(arg);
    txOpen = false;
    return originalQuery('ROLLBACK')
      .catch((err) => console.error('[scopedPool] forced rollback on dangling transaction before release:', err.message))
      .then(() => originalRelease(arg));
  };
  return client;
}

async function scopedConnect(pool) {
  const client = await pool.connect();
  const orgId = getCurrentOrgId();
  const userId = getCurrentUserId();
  const programScopeValue = programScopeGucValue(getCurrentProgramScope());
  return wrapClientForScope(client, orgId, userId, programScopeValue);
}

/**
 * @param {import('pg').Pool} pool
 * @returns a new object exposing exactly the two methods every
 *   organizational route file actually calls (verified by audit --
 *   query()/connect() cover 100% of this codebase's pool usage under
 *   server/organizational/). Does not mutate the original pool.
 */
function wrapPoolWithOrgScoping(pool) {
  return {
    query: (text, params) => scopedQuery(pool, text, params),
    connect: () => scopedConnect(pool),
  };
}

module.exports = { wrapPoolWithOrgScoping };
