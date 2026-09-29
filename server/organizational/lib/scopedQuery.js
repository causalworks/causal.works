'use strict';

// Not wired into any route yet -- see .claude/plans/rls-foundation-coop-tables.md.
// Runs a single query inside a transaction with app.current_org_id set for that transaction
// only, so the RLS policies added in migration 137 can enforce org isolation at the DB layer.
// Uses set_config() with a bound parameter (not string-interpolated SET) to avoid injection.
async function queryAsOrg(pool, orgId, text, params) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_org_id', String(orgId)]);
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

module.exports = { queryAsOrg };
