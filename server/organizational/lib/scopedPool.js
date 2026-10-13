'use strict';

const { getCurrentOrgId, getCurrentUserId, getCurrentProgramScope } = require('./orgContext');

function programScopeGucValue(scope) {
  if (scope == null) return '*';
  return scope.join(',');
}

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

function wrapClientForScope(client, orgId, userId, programScopeValue) {
  const originalQuery = client.query.bind(client);
  const originalRelease = client.release.bind(client);
  let primed = false;
  let txOpen = false;
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

function wrapPoolWithOrgScoping(pool) {
  return {
    query: (text, params) => scopedQuery(pool, text, params),
    connect: () => scopedConnect(pool),
  };
}

module.exports = { wrapPoolWithOrgScoping };
